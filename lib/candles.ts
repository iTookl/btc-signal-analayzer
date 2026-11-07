import { Candle } from './types';

export interface BinanceKline { t: number; o: string; h: string; l: string; c: string; v: string }

/** Convert a Binance WebSocket kline payload into a Candle (all Binance prices). */
export function klineToCandle(k: BinanceKline): Candle {
  return { t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v };
}

/**
 * Merge a live candle into the series: replace the last candle if it is the
 * same period, append (dropping the oldest beyond `max`) if it is newer,
 * ignore it if the series is empty or the candle is older.
 */
export function applyCandle(prev: Candle[], tick: Candle, max = 50): Candle[] {
  if (!prev.length) return prev;
  const last = prev[prev.length - 1];
  if (tick.t < last.t) return prev;
  const updated = [...prev];
  if (tick.t === last.t) updated[updated.length - 1] = tick;
  else {
    updated.push(tick);
    if (updated.length > max) updated.shift();
  }
  return updated;
}
