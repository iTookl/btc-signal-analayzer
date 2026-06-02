'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Candle, PolymarketData, Lang, Interval, Direction, SignalResult, SignalHistoryEntry } from '@/lib/types';
import { analyze, analyzeDivergence } from '@/lib/analyzer';
import { T } from '@/lib/i18n';
import SignalCard, { TradeMode } from '@/components/SignalCard';
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

// ── Trade mode persistence ────────────────────────────────────────────────

function useTradeMode(): [TradeMode, (v: TradeMode) => void] {
  const [mode, setModeState] = useState<TradeMode>('safe');
  useEffect(() => {
    const s = localStorage.getItem('tradeMode') as TradeMode | null;
    if (s === 'safe' || s === 'aggressive' || s === 'degen') setModeState(s);
  }, []);
  const setMode = useCallback((v: TradeMode) => {
    localStorage.setItem('tradeMode', v);
    setModeState(v);
  }, []);
  return [mode, setMode];
}

// ── Window countdown ──────────────────────────────────────────────────────

function useWindowCountdown(interval: Interval): number {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const step = interval === '5m' ? 300 : 900;
    const tick = () => {
      const now = Math.floor(Date.now() / 1000);
      setSec(step - (now % step));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [interval]);
  return sec;
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
  connected: boolean,
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
        try {
          const stored = localStorage.getItem(`sh_${iv}`);
          setHistory(stored ? (JSON.parse(stored) as SignalHistoryEntry[]) : []);
        } catch { setHistory([]); }
      });
  }

  useEffect(() => {
    loadHistory(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prevConnectedRef = useRef(false);
  useEffect(() => {
    if (connected && !prevConnectedRef.current) loadHistory(interval);
    prevConnectedRef.current = connected;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  useEffect(() => {
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
      prevCandleTimeRef.current = currentCandle.t;
      signalRef.current         = analysis.signal;
      return;
    }

    if (currentCandle.t !== prevCandleTimeRef.current) {
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
        void time;
        setHistory(prev => {
          if (prev.some(e => e.candleTime === entry.candleTime)) return prev;
          return [entry, ...prev].slice(0, 100);
        });
        pendingRef.current = null;
      }

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

const MAX_TICKS = 30;

function useMarketData(interval: Interval) {
  const [candles,    setCandles]    = useState<Candle[]>([]);
  const [ticks,      setTicks]      = useState<number[]>([]);
  const [polymarket, setPolymarket] = useState<PolymarketData>({ up: null, down: null });
  const [loading,    setLoading]    = useState(true);
  const [connected,  setConnected]  = useState(false);

  const wsRef             = useRef<WebSocket | null>(null);
  const slugRef           = useRef<string | null>(null);
  const chainlinkPriceRef = useRef<number | null>(null);
  const candlesRef        = useRef<Candle[]>([]);

  // Keep ref in sync so the 2s tick interval can read current price without stale closure
  useEffect(() => { candlesRef.current = candles; }, [candles]);

  const analysis = useMemo(
    () => candles.length > 0 ? analyze(candles, ticks) : null,
    [candles, ticks],
  );

  // Candles REST fetch — re-runs when interval changes
  useEffect(() => {
    setCandles([]);
    setTicks([]);
    setLoading(true);
    let active = true;

    (async () => {
      try {
        const res = await fetch(`/api/candles?interval=${interval}`);
        const data = await res.json();
        if (active && Array.isArray(data)) { setCandles(data); setLoading(false); return; }
      } catch { /* fall through */ }

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
        const closePrice = chainlinkPriceRef.current ?? +k.c;
        const tick: Candle = { t: k.t, o: +k.o, h: +k.h, l: +k.l, c: closePrice, v: +k.v };
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

  // 2-second tick accumulator — pushes current candle close price for tick trend
  useEffect(() => {
    setTicks([]);
    const id = setInterval(() => {
      const cur = candlesRef.current;
      if (!cur.length) return;
      const price = cur[cur.length - 1].c;
      setTicks(prev => {
        const next = [...prev, price];
        return next.length > MAX_TICKS ? next.slice(-MAX_TICKS) : next;
      });
    }, 2000);
    return () => clearInterval(id);
  }, [interval]);

  // Polymarket — direct browser polling every 1s
  useEffect(() => {
    let destroyed = false;
    slugRef.current = null;
    setPolymarket({ up: null, down: null });

    const poll = async () => {
      if (destroyed) return;

      if (!slugRef.current) {
        for (const slug of getPolymarketSlugs(interval)) {
          const result = await fetchPolyDirect(slug);
          if (result) {
            slugRef.current = slug;
            if (!destroyed) setPolymarket(result);
            return;
          }
        }
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

      const result = await fetchPolyDirect(slugRef.current);
      if (result) {
        if (!destroyed) setPolymarket(result);
      } else {
        slugRef.current = null;
      }
    };

    poll();
    const iv = setInterval(poll, 1000);
    return () => { destroyed = true; clearInterval(iv); };
  }, [interval]);

  // Chainlink price — Polymarket oracle, updates ~every 27s on Polygon
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch('/api/chainlink');
        const data: { price: number | null } = await res.json();
        const price = data.price;
        if (!price || isNaN(price) || !active) return;
        chainlinkPriceRef.current = price;
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

  return { candles, ticks, polymarket, analysis, loading, connected };
}

// ── Page ─────────────────────────────────────────────────────────────────

const MODE_COLORS: Record<TradeMode, string> = {
  safe:       '#3d9e6e',
  aggressive: '#a0a060',
  degen:      '#e05050',
};

export default function Home() {
  const [lang, toggleLang]          = useLang();
  const [interval, setIntervalMode] = useIntervalMode();
  const [mode, setMode]             = useTradeMode();
  const { candles, ticks, polymarket, analysis, loading, connected } = useMarketData(interval);
  const signalHistory = useSignalHistory(interval, analysis, candles, connected);
  const windowSec     = useWindowCountdown(interval);
  const t = T[lang];

  const isSnipeWindow = windowSec <= 10 && windowSec > 0;

  // Clock
  const [clockStr, setClockStr] = useState('—');
  useEffect(() => {
    const fmt = () => new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setClockStr(fmt());
    const id = setInterval(() => setClockStr(fmt()), 1000);
    return () => clearInterval(id);
  }, []);

  const lastCandle   = candles[candles.length - 1];
  const candleChange = lastCandle ? lastCandle.c - lastCandle.o : null;
  const divergence   = analysis ? analyzeDivergence(analysis.signal, polymarket.up) : null;

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
                {loading ? t.loading : connected ? `${t.liveStatus} · ${clockStr}` : `${t.updatedAt} ${clockStr}`}
              </span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Trade mode selector */}
            {(['safe', 'aggressive', 'degen'] as TradeMode[]).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className="px-2 py-1 rounded text-xs font-bold"
                style={{
                  background: mode === m ? `${MODE_COLORS[m]}22` : '#0f1726',
                  border: `1px solid ${mode === m ? MODE_COLORS[m] : '#1e2d4a'}`,
                  color: mode === m ? MODE_COLORS[m] : '#4a5a6a',
                  cursor: 'pointer',
                }}
              >
                {m === 'safe' ? t.modeSafe : m === 'aggressive' ? t.modeAggressive : t.modeDegen}
              </button>
            ))}

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

        {/* Stats row: price | window countdown */}
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
            style={{
              background: isSnipeWindow ? '#1a1000' : '#0f1726',
              border: `1px solid ${isSnipeWindow ? '#e08020' : '#1e2d4a'}`,
              boxShadow: isSnipeWindow ? '0 0 12px #e0802033' : 'none',
              transition: 'all 0.3s',
            }}
          >
            <div className="text-xs mb-1" style={{ color: isSnipeWindow ? '#e08020' : '#8899aa' }}>
              {isSnipeWindow ? t.snipeLabel : (lang === 'ru' ? 'ДО ЗАКРЫТИЯ' : 'WINDOW CLOSE')}
            </div>
            <div
              className="text-2xl font-bold"
              style={{
                color: isSnipeWindow ? '#e08020' : windowSec <= 30 ? '#a0a060' : '#c8d8e8',
                fontFamily: 'monospace',
              }}
            >
              {t.windowCountdown(windowSec)}
            </div>
            <div className="text-xs mt-1" style={{ color: '#4a5a6a' }}>
              {ticks.length > 0 ? `${ticks.length} ticks` : interval}
            </div>
          </div>
        </div>

        {/* Signal card */}
        {analysis ? (
          <SignalCard
            signal={analysis.signal}
            score={analysis.score}
            confidence={analysis.confidence}
            lang={lang}
            agreeCount={analysis.agreeCount}
            totalCount={analysis.totalCount}
            neutralReason={analysis.neutralReason}
            mode={mode}
          />
        ) : (
          <div className="rounded-xl p-8 text-center" style={{ background: '#0f1726', border: '1px solid #1e2d4a', color: '#8899aa' }}>
            {t.loading}
          </div>
        )}

        {/* Market context */}
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

        {/* Candle chart */}
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
