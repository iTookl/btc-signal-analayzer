import { Redis } from '@upstash/redis';
import { analyze } from '@/lib/analyzer';
import { SignalHistoryEntry, Interval, Candle } from '@/lib/types';

const MAX_ENTRIES = 100;

function getRedis(): Redis | null {
  const url   = process.env.KV_REST_API_URL   ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

async function fetchCandles(interval: Interval): Promise<Candle[]> {
  const res = await fetch(
    `https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=${interval}&limit=52`,
    { cache: 'no-store' },
  );
  if (!res.ok) return [];
  const raw: unknown = await res.json();
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[][]).map(c => ({
    t: c[0] as number,
    o: +(c[1] as string),
    h: +(c[2] as string),
    l: +(c[3] as string),
    c: +(c[4] as string),
    v: +(c[5] as string),
  }));
}

async function recordInterval(interval: Interval, redis: Redis): Promise<void> {
  const candles = await fetchCandles(interval);
  // Need at least 24 candles: 14 for RSI seed + some buffer + outcome + forming
  if (candles.length < 24) return;

  // candles[-1] is the currently forming candle
  // candles[-2] is the most recently CLOSED candle → this is the OUTCOME
  // analyze(candles[0..-3]) gives the signal that was active at candles[-3] close,
  // which is the prediction for candles[-2]
  const outcomeCandle = candles[candles.length - 2];
  const predCandles   = candles.slice(0, -2);

  const key = `signals:${interval}`;
  const existing = (await redis.get<SignalHistoryEntry[]>(key)) ?? [];

  // Skip if we already recorded this candle
  if (existing.some(e => e.candleTime === outcomeCandle.t)) return;

  const analysis = analyze(predCandles);
  const move     = outcomeCandle.c - outcomeCandle.o;
  // neutral = no directional prediction; mark as incorrect so it doesn't inflate win rate
  const correct  = analysis.signal === 'neutral'
    ? false
    : analysis.signal === 'bull' ? move > 0 : move < 0;

  const entry: SignalHistoryEntry = {
    candleTime:   outcomeCandle.t,
    signal:       analysis.signal,
    priceAtOpen:  outcomeCandle.o,
    priceAtClose: outcomeCandle.c,
    correct,
    interval,
  };

  const updated = [entry, ...existing].slice(0, MAX_ENTRIES);
  await redis.set(key, updated);
}

export async function GET(): Promise<Response> {
  return Response.json({
    cron_secret_set: !!process.env.CRON_SECRET,
    redis_set: !!(process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL),
  });
}

export async function POST(request: Request): Promise<Response> {
  const secret = (request.headers.get('x-cron-secret') ?? '').trim();
  const expected = (process.env.CRON_SECRET ?? '').trim();
  if (!expected || secret !== expected) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const redis = getRedis();
  if (!redis) return Response.json({ error: 'Redis not configured' }, { status: 503 });

  const results = await Promise.allSettled([
    recordInterval('5m', redis),
    recordInterval('15m', redis),
  ]);

  const errors = results
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map(r => String(r.reason));

  return Response.json({ ok: true, errors: errors.length ? errors : undefined });
}
