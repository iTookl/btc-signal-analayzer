import { vi } from 'vitest';
import { Candle } from '@/lib/types';

const MIN = 60_000;

/** Build a candle from open/close; high/low wrap the body. */
export function candle(o: number, c: number, v = 100, t = 0): Candle {
  return { t, o, h: Math.max(o, c) + 1, l: Math.min(o, c) - 1, c, v };
}

/**
 * Build a series from [open, close, volume?] tuples, 15m apart.
 * Prepends `pad` flat-ish filler candles so analyze() gets ≥21 candles.
 */
export function series(tail: Array<[number, number, number?]>, pad = 25, start = 100_000): Candle[] {
  const out: Candle[] = [];
  let t = 1_700_000_000_000;
  // Alternating filler keeps RSI ~50 and EMA flat
  for (let i = 0; i < pad; i++) {
    const up = i % 2 === 0;
    out.push(candle(start, start + (up ? 5 : -5), 100, t));
    t += 15 * MIN;
  }
  for (const [o, c, v] of tail) {
    out.push(candle(o, c, v ?? 100, t));
    t += 15 * MIN;
  }
  return out;
}

/** Steady trend: each candle moves `step` from the previous close. */
export function trend(n: number, step: number, start = 100_000, v = 100): Candle[] {
  const out: Candle[] = [];
  let p = start;
  let t = 1_700_000_000_000;
  for (let i = 0; i < n; i++) {
    out.push(candle(p, p + step, v, t));
    p += step;
    t += 15 * MIN;
  }
  return out;
}

/** Binance kline array format: [openTime, o, h, l, c, v, ...] with strings. */
export function toKline(c: Candle): unknown[] {
  return [c.t, String(c.o), String(c.h), String(c.l), String(c.c), String(c.v), c.t + 15 * MIN - 1];
}

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

/** Replace global fetch with a URL-routing mock. Unmatched URLs → 404. */
export function mockFetch(handler: Handler) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return handler(url, init);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const req = (url: string, init?: RequestInit) => new Request(`http://localhost${url}`, init);
