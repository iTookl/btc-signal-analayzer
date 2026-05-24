'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, IChartApi, ISeriesApi, Time, TickMarkType } from 'lightweight-charts';
import { Candle, Direction, Lang } from '@/lib/types';
import { T } from '@/lib/i18n';

interface Props {
  candles: Candle[];
  signal: Direction | null;
  lang: Lang;
}

function toBar(c: Candle) {
  return { time: Math.floor(c.t / 1000) as Time, open: c.o, high: c.h, low: c.l, close: c.c };
}

export default function CandleChart({ candles, signal, lang }: Props) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const chartRef      = useRef<IChartApi | null>(null);
  const seriesRef     = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const ghostRef      = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const prevLenRef    = useRef(0);
  const ghostTimeRef  = useRef<number>(0);
  const ghostInitRef  = useRef(false);

  // Candle close countdown
  const [secsLeft, setSecsLeft] = useState(() => {
    const now = Math.floor(Date.now() / 1000);
    return 900 - (now % 900);
  });
  useEffect(() => {
    const tick = () => {
      const now = Math.floor(Date.now() / 1000);
      setSecsLeft(900 - (now % 900));
    };
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Create chart + two series on mount
  useEffect(() => {
    if (!containerRef.current) return;

    // Convert UTC unix-seconds to local browser time string
    const fmtTime = (t: Time) => {
      const d = new Date((t as number) * 1000);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    };

    const chart = createChart(containerRef.current, {
      layout: { background: { color: '#0a0e1a' }, textColor: '#8899aa' },
      grid: { vertLines: { color: '#1e2d4a' }, horzLines: { color: '#1e2d4a' } },
      crosshair: { vertLine: { color: '#3d9e6e44' }, horzLine: { color: '#3d9e6e44' } },
      timeScale: {
        borderColor: '#1e2d4a',
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (t: Time, type: TickMarkType) => {
          if (type === TickMarkType.Time || type === TickMarkType.TimeWithSeconds) return fmtTime(t);
          return null; // default for day/month/year marks
        },
      },
      localization: { timeFormatter: fmtTime },
      rightPriceScale: { borderColor: '#1e2d4a' },
      width: containerRef.current.clientWidth,
      height: 300,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#3d9e6e', downColor: '#e05050',
      borderUpColor: '#3d9e6e', borderDownColor: '#e05050',
      wickUpColor: '#3d9e6e', wickDownColor: '#e05050',
    });

    // Ghost series: semi-transparent, no price line, no last-value label
    const ghost = chart.addSeries(CandlestickSeries, {
      upColor: '#3d9e6e55', downColor: '#3d9e6e55',
      borderUpColor: '#3d9e6e66', borderDownColor: '#3d9e6e66',
      wickUpColor: '#3d9e6e33', wickDownColor: '#3d9e6e33',
      lastValueVisible: false,
      priceLineVisible: false,
    });

    chartRef.current = chart;
    seriesRef.current = series;
    ghostRef.current = ghost;

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.resize(containerRef.current.clientWidth, 300);
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      ghostRef.current = null;
      prevLenRef.current = 0;
      ghostTimeRef.current = 0;
      ghostInitRef.current = false;
    };
  }, []);

  // Main candle update — uses series.update() for WS ticks to preserve zoom
  useEffect(() => {
    const series = seriesRef.current;
    if (!series || candles.length === 0) return;

    if (prevLenRef.current === 0) {
      series.setData(candles.slice(-30).map(toBar));
      chartRef.current?.timeScale().fitContent();
    } else {
      series.update(toBar(candles[candles.length - 1]));
    }
    prevLenRef.current = candles.length;
  }, [candles]);

  // Ghost candle — redrawn whenever signal or latest candle changes
  useEffect(() => {
    const ghost = ghostRef.current;
    if (!ghost || candles.length < 10) return;

    if (!signal || signal === 'neutral') {
      ghost.setData([]);
      return;
    }

    const last = candles[candles.length - 1];
    const last10 = candles.slice(-10);
    const avgRange = last10.reduce((s, c) => s + (c.h - c.l), 0) / 10;
    const isBull = signal === 'bull';
    const color = isBull ? '#3d9e6e' : '#e05050';

    const ghostOpen  = last.c;
    const ghostClose = isBull ? ghostOpen + avgRange * 0.5 : ghostOpen - avgRange * 0.5;
    const bodyHigh   = Math.max(ghostOpen, ghostClose);
    const bodyLow    = Math.min(ghostOpen, ghostClose);
    const ghostHigh  = bodyHigh + avgRange * 0.2;
    const ghostLow   = bodyLow  - avgRange * 0.2;
    const ghostTime  = (Math.floor(last.t / 1000) + 900) as Time;

    ghost.applyOptions({
      upColor:        color + '55',
      downColor:      color + '55',
      borderUpColor:  color + '66',
      borderDownColor: color + '66',
      wickUpColor:    color + '33',
      wickDownColor:  color + '33',
    });

    ghost.setData([{ time: ghostTime, open: ghostOpen, high: ghostHigh, low: ghostLow, close: ghostClose }]);

    // fitContent when ghost first appears, or when it jumps to a new 15m slot
    const t = Number(ghostTime);
    if (!ghostInitRef.current || t !== ghostTimeRef.current) {
      ghostInitRef.current = true;
      ghostTimeRef.current = t;
      chartRef.current?.timeScale().fitContent();
    }
  }, [candles, signal]);

  const ghostLabel = signal && signal !== 'neutral'
    ? ` + ${signal === 'bull' ? '↑' : '↓'} ghost`
    : '';

  const timerMins = Math.floor(secsLeft / 60);
  const timerSecs = secsLeft % 60;
  const timerStr  = `${String(timerMins).padStart(2, '0')}:${String(timerSecs).padStart(2, '0')}`;
  const timerColor = secsLeft <= 60 ? '#e05050' : '#8899aa';

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1e2d4a' }}>
      <div
        className="px-4 py-2 text-xs flex items-center justify-between"
        style={{ color: '#8899aa', fontFamily: 'monospace', background: '#0f1726' }}
      >
        <span>
          {T[lang].chartLabel}
          {ghostLabel && (
            <span style={{ color: signal === 'bull' ? '#3d9e6e66' : '#e0505066', marginLeft: 8 }}>
              {ghostLabel}
            </span>
          )}
        </span>
        <span style={{ color: timerColor, letterSpacing: '0.05em' }}>{timerStr}</span>
      </div>
      <div ref={containerRef} style={{ background: '#0a0e1a' }} />
    </div>
  );
}
