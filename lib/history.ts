import { Candle, Direction, Interval, SignalHistoryEntry } from './types';

// ── What history measures ─────────────────────────────────────────────────
// Each entry answers: "the signal the app showed just before the SNIPE window
// (≥ SNIPE_SECONDS before close) — did that window close the way it said?"
// The live UI, the browser history and the server cron all use this one rule.

export const SNIPE_SECONDS = 10;
export const MAX_HISTORY = 100;

const stepMs = (interval: Interval) => (interval === '5m' ? 300 : 900) * 1000;

/** Seconds until the candle that opened at `openMs` closes. */
export function secondsLeft(openMs: number, interval: Interval, nowMs: number): number {
  return Math.floor((openMs + stepMs(interval) - nowMs) / 1000);
}

/**
 * Polymarket rule: resolves "Up" if the end price is GREATER THAN OR EQUAL to
 * the start price, otherwise "Down". A flat candle therefore counts as Up.
 */
export function resolvedUp(c: Candle): boolean {
  return c.c >= c.o;
}

export function isCorrect(signal: Direction, c: Candle): boolean {
  if (signal === 'neutral') return false;
  return signal === 'bull' ? resolvedUp(c) : !resolvedUp(c);
}

export interface Snapshot {
  candleTime: number;
  signal: Direction;
  secondsLeft: number;
}

/**
 * Snapshot the live signal for the forming (last) candle, or null if we're
 * already inside the snipe window — the last snapshot taken before it wins.
 */
export function takeSnapshot(candles: Candle[], signal: Direction, interval: Interval, nowMs: number): Snapshot | null {
  const forming = candles[candles.length - 1];
  if (!forming) return null;
  const left = secondsLeft(forming.t, interval, nowMs);
  if (left < SNIPE_SECONDS || left > stepMs(interval) / 1000) return null;
  return { candleTime: forming.t, signal, secondsLeft: left };
}

/**
 * Turn a snapshot into a history entry once its candle has closed, i.e. a
 * newer candle exists in `candles`. Returns null while it's still forming or
 * if the candle has scrolled out of the series.
 */
export function resolveSnapshot(snap: Snapshot, candles: Candle[], interval: Interval): SignalHistoryEntry | null {
  const last = candles[candles.length - 1];
  if (!last || last.t <= snap.candleTime) return null;
  const closed = candles.find(c => c.t === snap.candleTime);
  if (!closed) return null;
  return {
    candleTime:   closed.t,
    signal:       snap.signal,
    priceAtOpen:  closed.o,
    priceAtClose: closed.c,
    correct:      isCorrect(snap.signal, closed),
    interval,
    secondsLeft:  snap.secondsLeft,
  };
}

/** Union by candleTime (entries in `primary` win), newest first, capped. */
export function mergeHistory(primary: SignalHistoryEntry[], secondary: SignalHistoryEntry[], max = MAX_HISTORY): SignalHistoryEntry[] {
  const byTime = new Map<number, SignalHistoryEntry>();
  for (const e of secondary) byTime.set(e.candleTime, e);
  for (const e of primary) byTime.set(e.candleTime, e);
  return [...byTime.values()].sort((a, b) => b.candleTime - a.candleTime).slice(0, max);
}

/** Add one entry (no-op if that candle is already recorded). */
export function addEntry(history: SignalHistoryEntry[], entry: SignalHistoryEntry, max = MAX_HISTORY): SignalHistoryEntry[] {
  if (history.some(e => e.candleTime === entry.candleTime)) return history;
  return mergeHistory([entry], history, max);
}

/** Parse untrusted stored history (localStorage / Redis), dropping junk rows. */
export function parseHistory(raw: unknown, interval: Interval): SignalHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((e): e is SignalHistoryEntry =>
    !!e && typeof e === 'object' &&
    typeof e.candleTime === 'number' &&
    (e.signal === 'bull' || e.signal === 'bear' || e.signal === 'neutral') &&
    typeof e.priceAtOpen === 'number' && typeof e.priceAtClose === 'number' &&
    typeof e.correct === 'boolean' && e.interval === interval);
}
