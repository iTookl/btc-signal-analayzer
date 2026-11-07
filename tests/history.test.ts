import { describe, it, expect } from 'vitest';
import {
  secondsLeft, resolvedUp, isCorrect, takeSnapshot, resolveSnapshot,
  mergeHistory, addEntry, parseHistory, SNIPE_SECONDS, Snapshot,
} from '@/lib/history';
import { analyze } from '@/lib/analyzer';
import { applyCandle } from '@/lib/candles';
import { Candle, SignalHistoryEntry } from '@/lib/types';
import { candle, trend } from './helpers';

const W0 = 1_794_042_900_000;
const e = (t: number, extra: Partial<SignalHistoryEntry> = {}): SignalHistoryEntry =>
  ({ candleTime: t, signal: 'bull', priceAtOpen: 1, priceAtClose: 2, correct: true, interval: '15m', ...extra });

describe('Polymarket resolution rule', () => {
  it('end ≥ start resolves Up, including a flat candle', () => {
    expect(resolvedUp(candle(100, 101))).toBe(true);
    expect(resolvedUp(candle(100, 100))).toBe(true);
    expect(resolvedUp(candle(100, 99))).toBe(false);
  });
  it('isCorrect: flat → bull wins, bear loses; neutral never counts', () => {
    expect(isCorrect('bull', candle(100, 100))).toBe(true);
    expect(isCorrect('bear', candle(100, 100))).toBe(false);
    expect(isCorrect('bear', candle(100, 99))).toBe(true);
    expect(isCorrect('neutral', candle(100, 101))).toBe(false);
  });
});

describe('snapshots', () => {
  const c = (open: number) => [candle(1, 2, 1, open - 900_000), candle(1, 2, 1, open)];

  it('secondsLeft counts down to the close', () => {
    expect(secondsLeft(W0, '15m', W0)).toBe(900);
    expect(secondsLeft(W0, '15m', W0 + 899_000)).toBe(1);
    expect(secondsLeft(W0, '5m', W0 + 60_000)).toBe(240);
  });

  it(`snapshots until ${SNIPE_SECONDS}s before close, not after`, () => {
    expect(takeSnapshot(c(W0), 'bull', '15m', W0 + 890_000)).toEqual({ candleTime: W0, signal: 'bull', secondsLeft: 10 });
    expect(takeSnapshot(c(W0), 'bull', '15m', W0 + 891_000)).toBeNull();
  });

  it('no snapshot if the "forming" candle is actually stale (clock past its close)', () => {
    expect(takeSnapshot(c(W0), 'bull', '15m', W0 + 2_000_000)).toBeNull();
  });

  it('resolves only once a newer candle exists', () => {
    const snap: Snapshot = { candleTime: W0, signal: 'bear', secondsLeft: 42 };
    expect(resolveSnapshot(snap, c(W0), '15m')).toBeNull();
    const closed = [candle(100, 90, 1, W0), candle(90, 91, 1, W0 + 900_000)];
    expect(resolveSnapshot(snap, closed, '15m')).toEqual({
      candleTime: W0, signal: 'bear', priceAtOpen: 100, priceAtClose: 90, correct: true, interval: '15m', secondsLeft: 42,
    });
  });
});

describe('history list helpers', () => {
  it('mergeHistory: union, primary wins, newest first, capped', () => {
    const m = mergeHistory([e(2, { signal: 'bear' }), e(5)], [e(2), e(1), e(9)], 3);
    expect(m.map(x => x.candleTime)).toEqual([9, 5, 2]);
    expect(m.find(x => x.candleTime === 2)!.signal).toBe('bear');
  });

  it('addEntry is a no-op (same reference) for a duplicate candle', () => {
    const h = [e(1)];
    expect(addEntry(h, e(1, { signal: 'bear' }))).toBe(h);
    expect(addEntry(h, e(2)).map(x => x.candleTime)).toEqual([2, 1]);
  });

  it('parseHistory drops junk and other-interval rows', () => {
    expect(parseHistory(null, '15m')).toEqual([]);
    expect(parseHistory('nope', '15m')).toEqual([]);
    expect(parseHistory([e(1), e(2, { interval: '5m' }), { candleTime: 'x' }, null, 5], '15m')).toEqual([e(1)]);
  });
});

describe('REGRESSION: browser history records the signal the user saw', () => {
  // Replays the useSignalHistory effect logic against a simulated live feed.
  function simulate(steps: Array<{ now: number; candles: Candle[] }>) {
    let snap: Snapshot | null = null;
    let history: SignalHistoryEntry[] = [];
    for (const { now, candles } of steps) {
      const a = analyze(candles);
      if (snap) {
        const entry = resolveSnapshot(snap, candles, '15m');
        if (entry) { history = addEntry(history, entry); snap = null; }
      }
      snap = takeSnapshot(candles, a.signal, '15m', now) ?? snap;
    }
    return history;
  }

  it('entry for window A carries A\'s own last pre-snipe signal and A\'s outcome', () => {
    // Window A: up-trend, live candle rising → bull. Then A closes down.
    const base = trend(30, 10).map((c, i, arr) => ({ ...c, t: W0 - (arr.length - 1 - i) * 900_000 }));
    const aLive = base;
    const aFinal = applyCandle(base, { ...base.at(-1)!, c: base.at(-1)!.o - 200 });
    const bOpen = applyCandle(aFinal, candle(aFinal.at(-1)!.c, aFinal.at(-1)!.c, 1, W0 + 900_000));

    const liveSignal = analyze(aLive).signal;
    const h = simulate([
      { now: W0 + 600_000, candles: aLive },   // 5 min left: snapshot
      { now: W0 + 895_000, candles: aFinal },  // snipe window: no new snapshot
      { now: W0 + 901_000, candles: bOpen },   // B opened → A resolves
    ]);
    expect(h).toHaveLength(1);
    expect(h[0].candleTime).toBe(W0);
    expect(h[0].signal).toBe(liveSignal);
    expect(h[0].secondsLeft).toBe(300);
    expect(h[0].priceAtClose).toBe(aFinal.at(-1)!.c);
    expect(h[0].correct).toBe(liveSignal === 'bear');
  });
});
