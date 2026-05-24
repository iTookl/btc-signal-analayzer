'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Candle, PolymarketData, Lang } from '@/lib/types';
import { analyze, analyzeDivergence } from '@/lib/analyzer';
import { T } from '@/lib/i18n';
import SignalCard from '@/components/SignalCard';
import SignalGrid from '@/components/SignalGrid';
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

// ── Binance WebSocket + Polymarket polling ────────────────────────────────

interface BinanceKlineMsg {
  k: { t: number; o: string; h: string; l: string; c: string; v: string };
}

function useMarketData() {
  const [candles,    setCandles]    = useState<Candle[]>([]);
  const [polymarket, setPolymarket] = useState<PolymarketData>({ up: null, down: null });
  const [loading,    setLoading]    = useState(true);
  const [connected,  setConnected]  = useState(false);
  const [lastTick,   setLastTick]   = useState<Date | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Synchronous — no 1-render delay, so ghost candle appears on initial REST load
  const analysis = useMemo(() => candles.length > 0 ? analyze(candles) : null, [candles]);

  // Initial REST fetch for candles + polymarket
  useEffect(() => {
    (async () => {
      // Candles and polymarket fetched independently so one failure doesn't block the other
      const candlesPromise = (async () => {
        try {
          const res = await fetch('/api/candles');
          const data = await res.json();
          if (Array.isArray(data)) { setCandles(data); return; }
        } catch { /* fall through to client-side fetch */ }

        // Client-side fallback: Binance allows CORS from browsers
        try {
          const res = await fetch(
            'https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=15m&limit=50'
          );
          const data: unknown[][] = await res.json();
          setCandles(data.map(c => ({
            t: c[0] as number, o: +(c[1] as string), h: +(c[2] as string),
            l: +(c[3] as string), c: +(c[4] as string), v: +(c[5] as string),
          })));
        } catch { /* silent */ }
      })();

      const polyPromise = (async () => {
        try {
          const res = await fetch('/api/polymarket');
          const data = await res.json();
          if (data && typeof data === 'object') setPolymarket(data);
        } catch { /* silent */ }
      })();

      await Promise.allSettled([candlesPromise, polyPromise]);
      setLoading(false);
    })();
  }, []);

  // Binance WebSocket — live kline stream
  useEffect(() => {
    let destroyed = false;
    const connect = () => {
      if (destroyed) return;
      const ws = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@kline_15m');
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
        setLastTick(new Date());
      };
    };
    connect();
    return () => { destroyed = true; wsRef.current?.close(); };
  }, []);

  // Polymarket silent refresh every 60s
  useEffect(() => {
    const iv = setInterval(async () => {
      try { setPolymarket(await (await fetch('/api/polymarket')).json()); }
      catch { /* silent */ }
    }, 60_000);
    return () => clearInterval(iv);
  }, []);

  return { candles, polymarket, analysis, loading, connected, lastTick };
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function Home() {
  const [lang, toggleLang] = useLang();
  const { candles, polymarket, analysis, loading, connected, lastTick } = useMarketData();
  const t = T[lang];

  const lastCandle = candles[candles.length - 1];

  // $ change within the current 15m candle (open → live close from Binance WS)
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

  const tickStr = lastTick
    ? lastTick.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';

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
                  ? `${t.liveStatus} · ${tickStr}`
                  : `${t.updatedAt} ${tickStr}`}
              </span>
            </div>
          </div>
          <button
            onClick={toggleLang}
            className="px-4 py-2 rounded-lg text-sm font-bold"
            style={{ background: '#0f1726', border: '1px solid #1e2d4a', color: '#8899aa', cursor: 'pointer' }}
          >
            {lang === 'ru' ? 'EN' : 'RU'}
          </button>
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
            <div className="text-xs" style={{ color: '#8899aa' }}>{t.intervalLabel}</div>
          </div>
        </div>

        {/* Signal card */}
        {analysis ? (
          <SignalCard signal={analysis.signal} score={analysis.score} lang={lang} />
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
              {t.marketContext(marketCtx.bull, marketCtx.bear, marketCtx.move)}
            </span>
          </div>
        )}

        {/* Candle chart with ghost candle */}
        {candles.length > 0 && (
          <CandleChart
            candles={candles}
            signal={analysis?.signal ?? null}
            lang={lang}
          />
        )}

        {/* Signals grid */}
        {analysis && <SignalGrid signals={analysis.signals} lang={lang} />}

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
