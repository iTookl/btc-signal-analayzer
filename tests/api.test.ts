import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockFetch, json, req, trend, toKline } from './helpers';
import { SignalHistoryEntry } from '@/lib/types';

// ── In-memory Redis mock ──────────────────────────────────────────────────
const store = vi.hoisted(() => ({ data: new Map<string, unknown>(), fail: false, ctorArgs: [] as unknown[] }));
vi.mock('@upstash/redis', () => ({
  Redis: class {
    constructor(opts: unknown) { store.ctorArgs.push(opts); }
    async get(k: string) { if (store.fail) throw new Error('redis down'); return store.data.get(k) ?? null; }
    async set(k: string, v: unknown) { if (store.fail) throw new Error('redis down'); store.data.set(k, structuredClone(v)); return 'OK'; }
  },
}));

beforeEach(() => {
  store.data.clear();
  store.fail = false;
  store.ctorArgs = [];
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

// ── /api/candles ──────────────────────────────────────────────────────────
describe('GET /api/candles', async () => {
  const { GET } = await import('@/app/api/candles/route');
  const klines = trend(3, 10).map(toKline);

  it('parses Binance klines into numeric candles', async () => {
    mockFetch(() => json(klines));
    const res = await GET(req('/api/candles?interval=5m'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(3);
    expect(body[0]).toEqual({ t: 1_700_000_000_000, o: 100000, h: 100011, l: 99999, c: 100010, v: 100 });
    Object.values(body[0]).forEach(v => expect(typeof v).toBe('number'));
  });

  it('passes 5m through and defaults anything else to 15m', async () => {
    const f = mockFetch(() => json(klines));
    await GET(req('/api/candles?interval=5m'));
    expect(f.mock.calls[0][0]).toContain('interval=5m');
    f.mockClear();
    await GET(req('/api/candles?interval=1h;DROP'));
    expect(f.mock.calls.every(c => String(c[0]).includes('interval=15m&'))).toBe(true);
  });

  it('falls back to another host when data-api is geo-blocked', async () => {
    mockFetch(url => url.startsWith('https://data-api') ? json({}, 451) : json(klines));
    const res = await GET(req('/api/candles'));
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(3);
  });

  it('returns 502 when every host fails', async () => {
    mockFetch(() => { throw new Error('network'); });
    const res = await GET(req('/api/candles'));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'all Binance endpoints failed' });
  });
});

// ── /api/chainlink ────────────────────────────────────────────────────────
describe('GET /api/chainlink', async () => {
  const { GET } = await import('@/app/api/chainlink/route');
  const slot = (n: bigint) => n.toString(16).padStart(64, '0');
  const abi = (price: number, updatedAt: number) =>
    '0x' + slot(BigInt(1)) + slot(BigInt(Math.round(price * 1e8))) + slot(BigInt(0)) + slot(BigInt(updatedAt)) + slot(BigInt(1));

  it('decodes latestRoundData from the Polygon RPC', async () => {
    mockFetch(() => json({ jsonrpc: '2.0', id: 1, result: abi(76046.38364972, 1794043486) }));
    const body = await (await GET()).json();
    expect(body).toEqual({ price: 76046.38364972, updatedAt: 1794043486, source: 'chainlink' });
  });

  it('sends a correct eth_call to the BTC/USD aggregator', async () => {
    const f = mockFetch(() => json({ result: abi(70000, 1) }));
    await GET();
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://polygon.publicnode.com');
    const payload = JSON.parse(String(init?.body));
    expect(payload.method).toBe('eth_call');
    expect(payload.params[0]).toEqual({ to: '0xc907E116054Ad103354f2D350FD2514433D57F6f', data: '0xfeaf968c' });
  });

  it.each([
    ['empty result', { result: '0x' }],
    ['short result', { result: '0x' + 'ab'.repeat(10) }],
    ['insane price', { result: abi(5, 1) }],
    ['rpc error', { error: { code: -32000 } }],
  ])('falls back to CoinGecko on %s', async (_, rpc) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_794_000_000_000);
    mockFetch(url => url.includes('coingecko') ? json({ bitcoin: { usd: 76100 } }) : json(rpc));
    const body = await (await GET()).json();
    expect(body).toEqual({ price: 76100, updatedAt: 1_794_000_000, source: 'coingecko' });
  });

  it('returns 502 when both sources fail', async () => {
    mockFetch(() => json({}, 500));
    const res = await GET();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ price: null, updatedAt: null, error: 'unavailable' });
  });
});

// ── /api/polymarket ───────────────────────────────────────────────────────
describe('GET /api/polymarket', async () => {
  const { GET } = await import('@/app/api/polymarket/route');
  const NOW = 1_794_043_502; // 09:25:02 UTC → 15m window 09:15 (…2900), next 09:30 (…3800)
  const ev = (slug: string, up: number, extra: object = {}) =>
    [{ slug, active: true, closed: false, markets: [{ outcomePrices: JSON.stringify([String(up), String(1 - up)]) }], ...extra }];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW * 1000);
  });

  it('returns odds for the current window slug', async () => {
    mockFetch(url => url.includes('slug=btc-updown-15m-1794042900') ? json(ev('btc-updown-15m-1794042900', 0.6)) : json([]));
    expect(await (await GET(req('/api/polymarket'))).json())
      .toEqual({ up: 0.6, down: 0.4, slug: 'btc-updown-15m-1794042900' });
  });

  it('REGRESSION: prefers the current window even when the next one is listed', async () => {
    // Live check: current …2900 had UP 30.5%, app showed next …3800 at 50.5%
    mockFetch(url => {
      const slug = /slug=([^&]+)/.exec(url)?.[1];
      if (slug === 'btc-updown-15m-1794042900') return json(ev(slug, 0.305));
      if (slug === 'btc-updown-15m-1794043800') return json(ev(slug, 0.505));
      return json([]);
    });
    const body = await (await GET(req('/api/polymarket?interval=15m'))).json();
    expect(body.slug).toBe('btc-updown-15m-1794042900');
    expect(body.up).toBe(0.305);
  });

  it('REGRESSION: never queries or returns a future window', async () => {
    const f = mockFetch(url => url.includes('slug=btc-updown-15m-1794043800') ? json(ev('btc-updown-15m-1794043800', 0.5)) : json([]));
    const body = await (await GET(req('/api/polymarket'))).json();
    expect(body.up).toBeNull();
    expect(f.mock.calls.some(c => String(c[0]).includes('1794043800'))).toBe(false);
  });

  it('uses 300s boundaries and the 5m prefix for interval=5m', async () => {
    const f = mockFetch(() => json([]));
    await GET(req('/api/polymarket?interval=5m'));
    const slugs = f.mock.calls.map(c => String(c[0])).filter(u => u.includes('slug=')).map(u => /slug=([^&]+)/.exec(u)![1]);
    expect(slugs).toEqual(['btc-updown-5m-1794043500']);
  });

  it('at the exact boundary second, the new window is current', async () => {
    vi.setSystemTime(1_794_043_800_000);
    const f = mockFetch(() => json([]));
    await GET(req('/api/polymarket'));
    expect(String(f.mock.calls[0][0])).toContain('slug=btc-updown-15m-1794043800&');
  });

  it.each([
    ['closed', { closed: true }, 0.5],
    ['inactive', { active: false }, 0.5],
    ['resolved (≥0.98)', {}, 0.99],
    ['resolved (≤0.02)', {}, 0.01],
  ])('skips %s markets', async (_, extra, up) => {
    mockFetch(url => url.includes('slug=') ? json(ev('x', up, extra)) : json([]));
    expect(await (await GET(req('/api/polymarket'))).json())
      .toEqual({ up: null, down: null, error: 'no_active_market' });
  });

  it('falls back to search when the slug lookup fails', async () => {
    mockFetch(url => url.includes('q=BTC')
      ? json([{ slug: 'eth-updown-15m-1', markets: [{ outcomePrices: '["0.5","0.5"]' }] }, ...ev('btc-updown-15m-1794042900', 0.3)])
      : json([]));
    expect(await (await GET(req('/api/polymarket'))).json()).toEqual({ up: 0.3, down: 0.7, slug: 'btc-updown-15m-1794042900' });
  });

  it('REGRESSION: search fallback ignores future/past windows', async () => {
    mockFetch(url => url.includes('q=BTC')
      ? json([...ev('btc-updown-15m-1794043800', 0.5), ...ev('btc-updown-15m-1794042000', 0.5), ...ev('btc-updown-5m-1794043500', 0.5)])
      : json([]));
    expect((await (await GET(req('/api/polymarket'))).json()).error).toBe('no_active_market');
  });

  it('survives malformed outcomePrices JSON', async () => {
    mockFetch(() => json([{ slug: 'btc-updown-15m-1', markets: [{ outcomePrices: 'not json' }] }]));
    const res = await GET(req('/api/polymarket'));
    expect(res.status).toBe(200);
    expect((await res.json()).error).toBe('no_active_market');
  });
});

// ── /api/history ──────────────────────────────────────────────────────────
describe('GET /api/history', async () => {
  const { GET } = await import('@/app/api/history/route');
  const entry: SignalHistoryEntry = { candleTime: 1, signal: 'bull', priceAtOpen: 1, priceAtClose: 2, correct: true, interval: '5m' };

  it('returns [] when Redis is not configured', async () => {
    vi.stubEnv('KV_REST_API_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    expect(await (await GET(req('/api/history'))).json()).toEqual([]);
  });

  it('reads the per-interval key', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://r');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 't');
    store.data.set('signals:5m', [entry]);
    expect(await (await GET(req('/api/history?interval=5m'))).json()).toEqual([entry]);
    expect(await (await GET(req('/api/history?interval=15m'))).json()).toEqual([]);
  });

  it('returns [] when Redis throws', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://r');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 't');
    store.fail = true;
    expect(await (await GET(req('/api/history'))).json()).toEqual([]);
  });
});

// ── /api/cron/record ──────────────────────────────────────────────────────
describe('/api/cron/record', async () => {
  const { GET, POST } = await import('@/app/api/cron/record/route');
  const post = (secret?: string) =>
    POST(req('/api/cron/record', { method: 'POST', headers: secret === undefined ? {} : { 'x-cron-secret': secret } }));

  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://r');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 't');
  });

  it('GET reports config without leaking secrets', async () => {
    const body = await (await GET()).json();
    expect(body).toEqual({ cron_secret_set: true, redis_set: true });
    expect(JSON.stringify(body)).not.toContain('s3cret');
  });

  it.each([[undefined], [''], ['wrong'], ['s3cret-x']])('rejects secret %j with 401', async secret => {
    const f = mockFetch(() => json([]));
    expect((await post(secret)).status).toBe(401);
    expect(f).not.toHaveBeenCalled();
  });

  it('rejects everything when CRON_SECRET is unset (even empty header)', async () => {
    vi.stubEnv('CRON_SECRET', '');
    expect((await post('')).status).toBe(401);
  });

  it('returns 503 when Redis is not configured', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    expect((await post('s3cret')).status).toBe(503);
  });

  it('records the last CLOSED candle for both intervals, predicted without it', async () => {
    // 30 up candles, then outcome candle −50, then forming candle
    const c = trend(32, 10);
    c[30] = { ...c[30], o: 100300, c: 100250 };
    mockFetch(() => json(c.map(toKline)));
    const res = await post('s3cret');
    expect(await res.json()).toEqual({ ok: true });

    for (const iv of ['5m', '15m'] as const) {
      const [e] = store.data.get(`signals:${iv}`) as SignalHistoryEntry[];
      expect(e.candleTime).toBe(c[30].t);
      expect(e.priceAtOpen).toBe(100300);
      expect(e.priceAtClose).toBe(100250);
      expect(e.interval).toBe(iv);
      expect(e.signal).toBe('bull');   // up-trend prediction…
      expect(e.correct).toBe(false);   // …but the candle closed down
    }
  });

  it('marks a correct prediction', async () => {
    mockFetch(() => json(trend(32, 10).map(toKline)));
    await post('s3cret');
    expect((store.data.get('signals:5m') as SignalHistoryEntry[])[0].correct).toBe(true);
  });

  it('is idempotent for the same candle', async () => {
    mockFetch(() => json(trend(32, 10).map(toKline)));
    await post('s3cret');
    await post('s3cret');
    expect(store.data.get('signals:15m')).toHaveLength(1);
  });

  it('keeps newest first and caps history at 100', async () => {
    const old = Array.from({ length: 100 }, (_, i) => ({ candleTime: i, signal: 'bull', priceAtOpen: 1, priceAtClose: 2, correct: true, interval: '5m' }));
    store.data.set('signals:5m', old);
    const c = trend(32, 10);
    mockFetch(() => json(c.map(toKline)));
    await post('s3cret');
    const h = store.data.get('signals:5m') as SignalHistoryEntry[];
    expect(h).toHaveLength(100);
    expect(h[0].candleTime).toBe(c[30].t);
    expect(h.at(-1)!.candleTime).toBe(98);
  });

  it('skips when Binance returns too few candles or an error', async () => {
    mockFetch(url => url.includes('interval=5m') ? json(trend(10, 1).map(toKline)) : json({ code: -1 }, 451));
    expect(await (await post('s3cret')).json()).toEqual({ ok: true });
    expect(store.data.size).toBe(0);
  });

  it('reports Redis failures in errors[]', async () => {
    mockFetch(() => json(trend(32, 10).map(toKline)));
    store.fail = true;
    const body = await (await post('s3cret')).json();
    expect(body.ok).toBe(true);
    expect(body.errors).toHaveLength(2);
  });
});
