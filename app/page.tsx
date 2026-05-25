'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Candle, PolymarketData, Lang, Interval, Direction, SignalResult, SignalHistoryEntry } from '@/lib/types';
import { analyze, analyzeDivergence } from '@/lib/analyzer';
import { T } from '@/lib/i18n';
import SignalCard from '@/components/SignalCard';
import SignalGrid from '@/components/SignalGrid';
import SignalHistory from '@/components/SignalHistory';
import PolymarketBar from '@/components/PolymarketBar';
import DivergenceBox from '@/components/DivergenceBox';
import PriceDisplay from '@/components/PriceDisplay';

const CandleChart = dynamic(() => import('@/components/CandleChart'), { ssr: false });

// ── Language persistence ──────────────────────────────────────────────────

function useLang(): [Lang, () => void] {
  const [lang, setLang] = useState<Lang>('ru');
  useEffect(() => {
    const s = localStorage.getItem('lang') as Lang | null;
    if (s === 'en' || s === 'ru') setLang(s);
  }, []);
  const toggle = useCallback(() => {
    setLang(prev => {
      const next: Lang = prev === 'ru' ? 'en' : 'ru';
      localStorage.setItem('lang', next);
      return next;
    });
  }, []);
  return [lang, toggle];
}

// ── Interval persistence ──────────────────────────────────────────────────

function useIntervalMode(): [Interval, (v: Interval) => void] {
  const [interval, setIntervalState] = useState<Interval>('15m');
  useEffect(() => {
    const s = localStorage.getItem('interval') as Interval | null;
    if (s === '5m' || s === '15m') setIntervalState(s);
  }, []);
  const setInterval = useCallback((v: Interval) => {
    localStorage.setItem('interval', v);
    setIntervalState(v);
  }, []);
  return [interval, setInterval];
}

// ── Direct Polymarket browser polling helpers ─────────────────────────────

interface PolyResult { up: number; down: number; }

function getPolymarketSlugs(interval: Interval): string[] {
  const step = interval === '5m' ? 300 : 900;
  const now = Math.floor(Date.now() / 1000);
  const next = Math.ceil(now / step) * step;
  const prefix = `btc-updown-${interval}-`;
  return [next, next + step, next - step, next + step * 2].map(ts => `${prefix}${ts}`);
}

async function fetchPolyDirect(slug: string): Promise<PolyResult | null> {
  try {
    const res = await fetch(`https://gamma-api.polymarket.com/events?slug=${slug}&limit=1`);
    if (!res.ok) return null;
    const events: Array<{
      active?: boolean; closed?: boolean;
      markets?: Array<{ outcomePrices?: string }>;
    }> = await res.json();
    const event = events?.[0];
    if (!event?.markets?.length || event.closed === true || event.active === false) return null;
    const prices: string[] = JSON.parse(event.markets[0].outcomePrices ?? '[]');
    const up   = parseFloat(prices[0]);
    const down = parseFloat(prices[1]);
    if (isNaN(up) || isNaN(down) || up < 0.02 || up > 0.98) return null;
    return { up, down };
  } catch { return null; }
}

// ── Signal history (localStorage, 1 entry per closed candle) ─────────────

function useSignalHistory(
  interval: Interval,
  analysis: SignalResult | null,
  candles: Candle[],
): SignalHistoryEntry[] {
  const [history, setHistory] = useState<SignalHistoryEntry[]>([]);
  const prevCandleTimeRef = useRef<number>(0);
  const signalRef         = useRef<Direction | null>(null);
  const pendingRef        = useRef<{ time: number; signal: Direction; price: number } | null>(null);
  const prevIntervalRef   = useRef<Interval>(interval);

  function loadHistory(iv: Interval) {
    fetch(`/api/history?interval=${iv}`)
      .then(r => r.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) setHistory(data as SignalHistoryEntry[]);
      })
      .catch(() => {
        // Redis not configured — fall back to localStorage
        try {
          const stored = localStorage.getItem(`sh_${iv}`);
          setHistory(stored ? (JSON.parse(stored) as SignalHistoryEntry[]) : []);
        } catch { setHistory([]); }
      });
  }

  // Load from server on mount
  useEffect(() => {
    loadHistory(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Interval changed — reset and reload from server
    if (interval !== prevIntervalRef.current) {
      prevIntervalRef.current  = interval;
      prevCandleTimeRef.current = 0;
      signalRef.current        = null;
      pendingRef.current       = null;
      setHistory([]);
      loadHistory(interval);
      return;
    }

    if (!analysis || candles.length < 2) return;
    const currentCandle = candles[candles.length - 1];
    const prevCandle    = candles[candles.length - 2];

    if (prevCandleTimeRef.current === 0) {
      // First tick after load — just initialise refs, nothing to record yet
      prevCandleTimeRef.current = currentCandle.t;
      signalRef.current         = analysis.signal;
      return;
    }

    if (currentCandle.t !== prevCandleTimeRef.current) {
      // A new candle just opened → prevCandle is now fully closed

      // 1. Finalise any pending entry (prevCandle is its outcome candle)
      if (pendingRef.current) {
        const { time, signal } = pendingRef.current;
        const move    = prevCandle.c - prevCandle.o;
        const correct = signal === 'bull' ? move > 0 : move < 0;
        const entry: SignalHistoryEntry = {
          candleTime:   prevCandle.t,
          signal,
          priceAtOpen:  prevCandle.o,
          priceAtClose: prevCandle.c,
          correct,
          interval,
        };
        void time; // used in pendingRef only for bookkeeping
        setHistory(prev => {
          // Dedup: server cron may have already added this candle
          if (prev.some(e => e.candleTime === entry.candleTime)) return prev;
          return [entry, ...prev].slice(0, 100);
        });
        pendingRef.current = null;
      }

      // 2. Queue the signal active at prevCandle close as the prediction for the next candle
      if (signalRef.current && signalRef.current !== 'neutral') {
        pendingRef.current = { time: prevCandle.t, signal: signalRef.current, price: prevCandle.c };
      }
    }

    prevCandleTimeRef.current = currentCandle.t;
    signalRef.current         = analysis.signal;
  }, [candles, analysis, interval]);

  return history;
}

// ── Binance WebSocket + Polymarket polling ────────────────────────────────

interface BinanceKlineMsg {
  k: { t: number; o: string; h: string; l: string; c: string; v: string };
}

function useMarketData(interval: Interval) {
  const [candles,    setCandles]    = useState<Candle[]>([]);
  const [polymarket, setPolymarket] = useState<PolymarketData>({ up: null, down: null });
  const [loading,    setLoading]    = useState(true);
  const [connected,  setConnected]  = useState(false);
  const wsRef   = useRef<WebSocket | null>(null);
  const slugRef = useRef<string | null>(null);

  const analysis = useMemo(() => candles.length > 0 ? analyze(candles) : null, [candles]);

  // Candles REST fetch — re-runs when interval changes
  useEffect(() => {
    setCandles([]);
    setLoading(true);
    let active = true;

    (async () => {
      try {
        const res = await fetch(`/api/candles?interval=${interval}`);
        const data = await res.json();
        if (active && Array.isArray(data)) { setCandles(data); setLoading(false); return; }
      } catch { /* fall through */ }

      // Client-side fallback
      try {
        const res = await fetch(
          `https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=${interval}&limit=50`
        );
        const data: unknown[][] = await res.json();
        if (active) setCandles(data.map(c => ({
          t: c[0] as number, o: +(c[1] as string), h: +(c[2] as string),
          l: +(c[3] as string), c: +(c[4] as string), v: +(c[5] as string),
        })));
      } catch { /* silent */ }

      if (active) setLoading(false);
    })();

    return () => { active = false; };
  }, [interval]);

  // Binance WebSocket — re-runs when interval changes
  useEffect(() => {
    let destroyed = false;
    setConnected(false);

    const connect = () => {
      if (destroyed) return;
      const ws = new WebSocket(`wss://stream.binance.com:9443/ws/btcusdt@kline_${interval}`);
      wsRef.current = ws;
      ws.onopen  = () => { if (!destroyed) setConnected(true); };
      ws.onclose = () => { if (!destroyed) { setConnected(false); setTimeout(connect, 3000); } };
      ws.onerror = () => ws.close();
      ws.onmessage = (e: MessageEvent) => {
        const msg: BinanceKlineMsg = JSON.parse(e.data as string);
        const k = msg.k;
        const tick: Candle = { t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v };
        setCandles(prev => {
          if (!prev.length) return prev;
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.t === tick.t) { updated[updated.length - 1] = tick; }
          else { updated.push(tick); if (updated.length > 50) updated.shift(); }
          return updated;
        });
      };
    };
    connect();
    return () => { destroyed = true; wsRef.current?.close(); };
  }, [interval]);

  // Polymarket — direct browser polling every 1s, serverless fallback for slug discovery
  useEffect(() => {
    let destroyed = false;
    slugRef.current = null;
    setPolymarket({ up: null, down: null });

    const poll = async () => {
      if (destroyed) return;

      if (!slugRef.current) {
        // Try computing slug from time directly (no serverless needed)
        for (const slug of getPolymarketSlugs(interval)) {
          const result = await fetchPolyDirect(slug);
          if (result) {
            slugRef.current = slug;
            if (!destroyed) setPolymarket(result);
            return;
          }
        }
        // All direct slugs failed — fall back to our serverless for slug discovery
        try {
          const res = await fetch(`/api/polymarket?interval=${interval}`);
          const data: { up: number | null; down: number | null; slug?: string } = await res.json();
          if (data.slug && data.up !== null && !destroyed) {
            slugRef.current = data.slug;
            setPolymarket({ up: data.up, down: data.down });
          }
        } catch { /* silent */ }
        return;
      }

      // Known slug — poll directly
      const result = await fetchPolyDirect(slugRef.current);
      if (result) {
        if (!destroyed) setPolymarket(result);
      } else {
        slugRef.current = null; // market expired, will re-discover next tick
      }
    };

    poll();
    const iv = setInterval(poll, 1000);
    return () => { destroyed = true; clearInterval(iv); };
  }, [interval]);

  // Chainlink price — same oracle Polymarket uses for resolution, updates ~every 27s on Polygon
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch('/api/chainlink');
        const data: { price: number | null } = await res.json();
        const price = data.price;
        if (!price || isNaN(price) || !active) return;
        setCandles(prev => {
          if (!prev.length) return prev;
          const last = prev[prev.length - 1];
          if (last.c === price) return prev;
          const updated = [...prev];
          updated[updated.length - 1] = { ...last, c: price };
          return updated;
        });
      } catch { /* silent */ }
    };
    poll();
    const iv = setInterval(poll, 30_000);
    return () => { active = false; clearInterval(iv); };
  }, []);

  return { candles, polymarket, analysis, loading, connected };
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function Home() {
  const [lang, toggleLang]       = useLang();
  const [interval, setIntervalMode] = useIntervalMode();
  const { candles, polymarket, analysis, loading, connected } = useMarketData(interval);
  const signalHistory = useSignalHistory(interval, analysis, candles);
  const t = T[lang];

  // Clock — independent 1-second tick, not bound to WebSocket frequency
  const [clockStr, setClockStr] = useState('—');
  useEffect(() => {
    const fmt = () => new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setClockStr(fmt());
    const id = setInterval(() => setClockStr(fmt()), 1000);
    return () => clearInterval(id);
  }, []);

  const lastCandle = candles[candles.length - 1];
  const candleChange = lastCandle ? lastCandle.c - lastCandle.o : null;
  const divergence = analysis ? analyzeDivergence(analysis.signal, polymarket.up) : null;

  // Last 5 complete candles (excluding the currently-forming one)
  const marketCtx = useMemo(() => {
    if (!Array.isArray(candles) || candles.length < 6) return null;
    const slice = candles.slice(-6, -1);
    const bull = slice.filter(c => c.c > c.o).length;
    const move = slice[slice.length - 1].c - slice[0].o;
    return { bull, bear: 5 - bull, move };
  }, [candles]);

  return (
    <main className="min-h-screen" style={{ background: '#0a0e1a', color: '#c8d8e8', fontFamily: 'monospace' }}>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-widest" style={{ color: '#c8d8e8' }}>
              {t.title}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{
                  background: connected ? '#3d9e6e' : loading ? '#a0a060' : '#e05050',
                  boxShadow: connected ? '0 0 6px #3d9e6e' : 'none',
                  animation: connected ? 'pulse-dot 2s infinite' : 'none',
                }}
              />
              <span className="text-xs" style={{ color: '#8899aa' }}>
                {loading
                  ? t.loading
                  : connected
                  ? `${t.liveStatus} · ${clockStr}`
                  : `${t.updatedAt} ${clockStr}`}
              </span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            {/* Interval selector */}
            {(['5m', '15m'] as Interval[]).map(iv => (
              <button
                key={iv}
                onClick={() => setIntervalMode(iv)}
                className="px-3 py-2 rounded-lg text-sm font-bold"
                style={{
                  background: interval === iv ? '#1a2d1a' : '#0f1726',
                  border: `1px solid ${interval === iv ? '#3d9e6e' : '#1e2d4a'}`,
                  color: interval === iv ? '#3d9e6e' : '#8899aa',
                  cursor: 'pointer',
                }}
              >
                {iv.toUpperCase()}
              </button>
            ))}
            <button
              onClick={toggleLang}
              className="px-4 py-2 rounded-lg text-sm font-bold"
              style={{ background: '#0f1726', border: '1px solid #1e2d4a', color: '#8899aa', cursor: 'pointer' }}
            >
              {lang === 'ru' ? 'EN' : 'RU'}
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3">
          <div
            className="rounded-xl p-3 text-center"
            style={{ background: '#0f1726', border: '1px solid #1e2d4a' }}
          >
            <div className="text-xs mb-1" style={{ color: '#8899aa' }}>
              {t.priceLabel}
              <span className="ml-1" style={{ color: '#4a5a6a' }}>({t.priceSource})</span>
            </div>
            <PriceDisplay
              price={lastCandle?.c ?? null}
              updatedAt={null}
              candleChange={candleChange}
            />
          </div>

          <div
            className="rounded-xl p-3 text-center"
            style={{ background: '#0f1726', border: '1px solid #1e2d4a' }}
          >
            <div className="text-xs mb-1" style={{ color: '#8899aa' }}>{t.candlesLabel}</div>
            <div className="text-lg font-bold" style={{ color: '#c8d8e8' }}>{candles.length}</div>
            <div className="text-xs" style={{ color: '#8899aa' }}>{interval} {t.intervalLabel}</div>
          </div>
        </div>

        {/* Signal card */}
        {analysis ? (
          <SignalCard
            signal={analysis.signal}
            score={analysis.score}
            lang={lang}
            agreeCount={analysis.agreeCount}
            totalCount={analysis.totalCount}
          />
        ) : (
          <div className="rounded-xl p-8 text-center" style={{ background: '#0f1726', border: '1px solid #1e2d4a', color: '#8899aa' }}>
            {t.loading}
          </div>
        )}

        {/* Market context — last 5 complete candles */}
        {marketCtx && (
          <div
            className="px-4 py-3 rounded-xl text-sm"
            style={{ background: '#0f1726', border: '1px solid #1e2d4a', color: '#8899aa', fontFamily: 'monospace' }}
          >
            <span style={{ color: marketCtx.bull >= 4 ? '#3d9e6e' : marketCtx.bear >= 4 ? '#e05050' : '#a0a060' }}>
              {t.marketContext(marketCtx.bull, marketCtx.bear, marketCtx.move, interval)}
            </span>
          </div>
        )}

        {/* Candle chart with ghost candle */}
        {candles.length > 0 && (
          <CandleChart
            candles={candles}
            signal={analysis?.signal ?? null}
            lang={lang}
            interval={interval}
          />
        )}

        {/* Signals grid */}
        {analysis && <SignalGrid signals={analysis.signals} lang={lang} />}

        {/* Signal history */}
        <SignalHistory history={signalHistory} interval={interval} lang={lang} />

        {/* Polymarket */}
        <PolymarketBar data={polymarket} lang={lang} />

        {/* Divergence */}
        {divergence && <DivergenceBox result={divergence} lang={lang} />}

        {/* Footer */}
        <div
          className="text-center text-xs py-4"
          style={{ color: '#4a5a6a', borderTop: '1px solid #1e2d4a' }}
        >
          {t.footer}
        </div>
      </div>

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </main>
  );
}
