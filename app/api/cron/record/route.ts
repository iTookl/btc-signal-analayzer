import { Redis } from '@upstash/redis';
import { analyze } from '@/lib/analyzer';
import { Interval, Candle } from '@/lib/types';
import { Snapshot, takeSnapshot, resolveSnapshot, addEntry, parseHistory, MAX_HISTORY } from '@/lib/history';

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

// Each run does two things (see lib/history.ts for the shared rule):
//  1. Resolve: if the snapshot stored last time belongs to a candle that has
//     since closed, write it to history with the real outcome.
//  2. Snapshot: store the live signal of the FORMING candle — the same
//     analyze(candles) the UI shows — unless we're already in the snipe window.
// So history holds "the last signal seen ≥10s before close" per candle. Run
// the cron often (every 1 min) so that snapshot is close to the snipe moment.
// Server has no tick stream, so Tick Trend is 0 here (it's ±2 at most in UI).
async function recordInterval(interval: Interval, redis: Redis, nowMs: number): Promise<void> {
  const candles = await fetchCandles(interval);
  if (candles.length < 21) return;

  const pendingKey = `signals:pending:${interval}`;
  const historyKey = `signals:${interval}`;

  const pending = await redis.get<Snapshot>(pendingKey);
  if (pending) {
    const entry = resolveSnapshot(pending, candles, interval);
    if (entry) {
      const existing = parseHistory(await redis.get(historyKey), interval);
      const updated  = addEntry(existing, entry, MAX_HISTORY);
      if (updated !== existing) await redis.set(historyKey, updated);
    }
  }

  const snap = takeSnapshot(candles, analyze(candles).signal, interval, nowMs);
  if (snap) await redis.set(pendingKey, snap);
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

  const now = Date.now();
  const results = await Promise.allSettled([
    recordInterval('5m', redis, now),
    recordInterval('15m', redis, now),
  ]);

  const errors = results
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map(r => String(r.reason));

  return Response.json({ ok: true, errors: errors.length ? errors : undefined });
}
