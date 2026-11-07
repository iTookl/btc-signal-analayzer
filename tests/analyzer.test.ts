import { describe, it, expect } from 'vitest';
import { analyze, analyzeDivergence } from '@/lib/analyzer';
import { RawWindowDelta, RawAcceleration, RawRSI, RawVolumeSurge, RawTickTrend, RawEma } from '@/lib/types';
import { series, trend, candle } from './helpers';

const P = 100_000;
/** Close price that is `pct` % away from P. */
const at = (pct: number) => P * (1 + pct / 100);

describe('analyze — data sufficiency', () => {
  it('returns no_data neutral for an empty array', () => {
    const r = analyze([]);
    expect(r.signal).toBe('neutral');
    expect(r.neutralReason).toBe('no_data');
    expect(r.score).toBe(0);
    expect(r.totalCount).toBe(0);
    Object.values(r.signals).forEach(s => {
      expect(s.raw).toBeNull();
      expect(s.direction).toBe('neutral');
    });
  });

  it('returns no_data with 20 candles, analyses with 21', () => {
    expect(analyze(trend(20, 10)).neutralReason).toBe('no_data');
    const r = analyze(trend(21, 10));
    expect(r.neutralReason).not.toBe('no_data');
    expect(r.totalCount).toBe(7);
  });

  it('does not mutate the input array', () => {
    const c = trend(30, 10);
    const copy = structuredClone(c);
    analyze(c, [1, 2, 3, 4, 5]);
    expect(c).toEqual(copy);
  });

  it('produces finite numbers for realistic input', () => {
    const r = analyze(trend(50, -7.3), [P, P + 1, P - 2, P + 3, P + 1, P + 5]);
    expect(Number.isFinite(r.score)).toBe(true);
    expect(Number.isFinite(r.confidence)).toBe(true);
  });
});

describe('indicator 1 — window delta (live candle open→close)', () => {
  const wd = (pct: number) => analyze(series([[P, at(pct)]])).signals.windowDelta;

  it.each([
    [0.15, 7], [0.1001, 7], [0.0999, 5], [0.05, 5], [0.0201, 5],
    [0.0199, 3], [0.01, 3], [0.0051, 3], [0.0049, 1], [0.002, 1], [0.0011, 1],
    [0.0009, 0], [0, 0],
  ])('%s%% move → weight %s', (pct, weight) => {
    const r = wd(pct);
    expect((r.raw as RawWindowDelta).weight).toBe(weight);
    expect(r.direction).toBe(weight === 0 ? 'neutral' : 'bull');
  });

  it('is symmetric for down moves', () => {
    const r = wd(-0.15);
    expect((r.raw as RawWindowDelta).weight).toBe(7);
    expect((r.raw as RawWindowDelta).isBull).toBe(false);
    expect(r.direction).toBe('bear');
  });

  it('rounds pct to 4 decimals', () => {
    expect((wd(0.123456).raw as RawWindowDelta).pct).toBe(0.1235);
  });

  it('a large window delta alone outweighs every other indicator', () => {
    // last closed candles bearish, but live candle +0.2% → still bull overall
    const r = analyze(series([[P, P - 30], [P - 30, P - 60], [P, at(0.2)]]));
    expect(r.signals.microMomentum.direction).toBe('bear');
    expect(r.signal).toBe('bull');
  });
});

describe('indicator 2 — micro momentum (last 2 closed candles)', () => {
  const mm = (a: [number, number], b: [number, number]) =>
    analyze(series([a, b, [P, P]])).signals.microMomentum;

  it('both up → bull', () => expect(mm([P, P + 10], [P, P + 10]).direction).toBe('bull'));
  it('both down → bear', () => expect(mm([P, P - 10], [P, P - 10]).direction).toBe('bear'));
  it('mixed → neutral', () => {
    expect(mm([P, P + 10], [P, P - 10]).direction).toBe('neutral');
    expect(mm([P, P - 10], [P, P + 10]).direction).toBe('neutral');
  });
  it('ignores the live (last) candle', () => {
    const r = analyze(series([[P, P + 10], [P, P + 10], [P, P - 500]]));
    expect(r.signals.microMomentum.direction).toBe('bull');
  });
});

describe('indicator 3 — acceleration', () => {
  const acc = (prevBody: number, lastBody: number) =>
    analyze(series([[P, P + prevBody], [P, P + lastBody], [P, P]])).signals.acceleration;

  it('bigger bullish body → accelerating bull, ratio reported', () => {
    const r = acc(10, 30);
    expect(r.direction).toBe('bull');
    expect((r.raw as RawAcceleration).ratio).toBe(3);
  });
  it('smaller body → ratio < 1', () => {
    expect((acc(40, 10).raw as RawAcceleration).ratio).toBe(0.25);
  });
  it('bearish last candle → bear', () => {
    expect(acc(10, -30).direction).toBe('bear');
  });
  it('previous doji (zero body) → ratio 1, no division by zero', () => {
    const r = acc(0, 30);
    expect((r.raw as RawAcceleration).ratio).toBe(1);
    expect(Number.isFinite(analyze(series([[P, P], [P, P + 30], [P, P]])).score)).toBe(true);
  });
});

describe('indicator 4 — EMA 9/21', () => {
  it('uptrend → bull', () => {
    const r = analyze(trend(40, 20)).signals.ema;
    expect(r.direction).toBe('bull');
    const raw = r.raw as RawEma;
    expect(raw.ema9).toBeGreaterThan(raw.ema21);
  });
  it('downtrend → bear', () => {
    expect(analyze(trend(40, -20)).signals.ema.direction).toBe('bear');
  });
  it('EMA of a constant series equals that constant', () => {
    const flat = Array.from({ length: 30 }, (_, i) => candle(P, P, 100, i));
    const raw = analyze(flat).signals.ema.raw as RawEma;
    expect(raw.ema9).toBeCloseTo(P, 6);
    expect(raw.ema21).toBeCloseTo(P, 6);
  });
});

describe('indicator 5 — RSI 14 (contrarian)', () => {
  it('only gains → RSI 100, overbought, bear ×2', () => {
    const r = analyze(trend(30, 10)).signals.rsi;
    expect((r.raw as RawRSI).value).toBe(100);
    expect((r.raw as RawRSI).label).toBe('overbought');
    expect(r.direction).toBe('bear');
  });
  it('only losses → RSI 0, oversold, bull', () => {
    const r = analyze(trend(30, -10)).signals.rsi;
    expect((r.raw as RawRSI).value).toBe(0);
    expect(r.direction).toBe('bull');
  });
  it('balanced alternating moves → neutral zone', () => {
    const r = analyze(series([], 30)).signals.rsi;
    const v = (r.raw as RawRSI).value;
    expect(v).toBeGreaterThan(40);
    expect(v).toBeLessThan(60);
    expect(r.direction).toBe('neutral');
  });
  it('REGRESSION: perfectly flat prices → RSI 50, neutral (was 100/overbought)', () => {
    const flat = Array.from({ length: 30 }, (_, i) => candle(P, P, 100, i));
    expect((analyze(flat).signals.rsi.raw as RawRSI).value).toBe(50);
    expect(analyze(flat).signals.rsi.direction).toBe('neutral');
  });
});

describe('indicator 6 — volume surge', () => {
  const vol = (prior: number, recent: number, lastBull = true) => analyze(series([
    [P, P + 1, prior], [P, P + 1, prior], [P, P + 1, prior],
    [P, P + 1, recent], [P, P + 1, recent], [P, lastBull ? P + 1 : P - 1, recent],
    [P, P, 9999], // live candle volume must be ignored
  ])).signals.volumeSurge;

  it('≥1.5× → confirms direction of last closed candle', () => {
    expect(vol(100, 150).direction).toBe('bull');
    expect(vol(100, 150, false).direction).toBe('bear');
    expect((vol(100, 300).raw as RawVolumeSurge).ratio).toBe(3);
  });
  it('<1.5× → neutral', () => {
    expect(vol(100, 149).direction).toBe('neutral');
  });
  it('zero prior volume → ratio 1, no Infinity', () => {
    expect((vol(0, 100).raw as RawVolumeSurge).ratio).toBe(1);
  });
});

describe('indicator 7 — tick trend', () => {
  const tt = (ticks: number[]) => analyze(trend(30, 10), ticks).signals.tickTrend;

  it('fewer than 5 ticks → null', () => {
    expect(tt([1, 2, 3, 4]).raw).toBeNull();
  });
  it('all ticks identical → null', () => {
    expect(tt([P, P, P, P, P, P]).raw).toBeNull();
  });
  it('consistent rise with ≥0.005% move → bull', () => {
    const r = tt([P, P + 2, P + 4, P + 6, P + 8, P + 10]);
    expect(r.direction).toBe('bull');
    expect((r.raw as RawTickTrend).bullPct).toBe(100);
  });
  it('consistent fall → bear', () => {
    expect(tt([P, P - 2, P - 4, P - 6, P - 8, P - 10]).direction).toBe('bear');
  });
  it('consistent but tiny move (<0.005%) → neutral', () => {
    expect(tt([P, P + 0.5, P + 1, P + 1.5, P + 2, P + 2.5]).direction).toBe('neutral');
  });
  it('inconsistent ticks (<60%) → neutral', () => {
    // 3 up / 3 down = 50% consistency, move 0.01%
    expect(tt([P, P + 10, P, P + 10, P, P + 20, P + 10]).direction).toBe('neutral');
  });
  it('exactly 60% consistency is enough (boundary)', () => {
    // 3 up / 2 down
    expect(tt([P, P + 10, P, P + 10, P, P + 20]).direction).toBe('bull');
  });
});

describe('analyze — aggregation', () => {
  it('sums indicator scores exactly (hand-computed scenario)', () => {
    // 30 candles, each +10 from previous close, equal bodies & volume:
    //  windowDelta 10/100290 ≈ 0.00997% → weight 3       → +3
    //  microMomentum both up                              → +2
    //  acceleration ratio 1 (not >1) bullish              → +0.5
    //  EMA9 > EMA21                                       → +1
    //  RSI 100 overbought                                 → −2
    //  volume ratio 1                                     →  0
    //  ticks none                                         →  0
    const r = analyze(trend(30, 10));
    expect(r.score).toBeCloseTo(4.5, 10);
    expect(r.signal).toBe('bull');
    expect(r.confidence).toBeCloseTo(4.5 / 7, 10);
    expect(r.agreeCount).toBe(4);
    expect(r.neutralReason).toBeNull();
  });

  it('confidence is capped at 1', () => {
    const r = analyze(series([
      [P, P + 50, 100], [P, P + 50, 100], [P, P + 50, 100],
      [P, P + 60, 500], [P, P + 80, 500], [P, P + 200, 500],
      [P, at(0.5)],
    ]), [P, P + 20, P + 40, P + 60, P + 80, P + 100]);
    expect(r.confidence).toBe(1);
  });

  it('with no dojis, score is a half-integer (EMA ±1 + acceleration ±0.5/±1.5)', () => {
    for (const step of [-30, -5, 5, 30]) {
      const r = analyze(trend(40, step));
      expect(Math.abs(r.score % 1)).toBe(0.5);
    }
  });

  it('agreeCount never exceeds totalCount', () => {
    for (const step of [-30, -5, 5, 30]) {
      const r = analyze(trend(40, step), [P, P + step, P + 2 * step, P + 3 * step, P + 4 * step]);
      expect(r.agreeCount).toBeLessThanOrEqual(r.totalCount);
    }
  });
});

describe('analyzeDivergence', () => {
  it('null odds → unavailable', () => {
    expect(analyzeDivergence('bull', null)).toEqual({ type: 'unavailable', upPct: null });
  });
  it.each([
    ['bull', 0.44, 'bull_divergence', 44],
    ['bull', 0.45, 'consensus', 45],
    ['bull', 0.70, 'consensus', 70],
    ['bear', 0.56, 'bear_divergence', 56],
    ['bear', 0.55, 'consensus', 55],
    ['bear', 0.20, 'consensus', 20],
    ['neutral', 0.90, 'neutral', 90],
  ] as const)('%s @ %s → %s', (signal, up, type, pct) => {
    expect(analyzeDivergence(signal, up)).toEqual({ type, upPct: pct });
  });
  it('rounds upPct', () => {
    expect(analyzeDivergence('bull', 0.505).upPct).toBe(51);
  });
});

describe('REGRESSION: zero movement is not a bearish vote', () => {
  const flat = () => Array.from({ length: 40 }, (_, i) => candle(P, P, 100, i));

  it('completely flat market → every indicator neutral, signal neutral, score 0', () => {
    const r = analyze(flat());
    expect(r.signal).toBe('neutral');
    expect(r.score).toBe(0);
    Object.values(r.signals).forEach(s => expect(s.direction).toBe('neutral'));
  });

  it('doji last closed candle → acceleration neutral, score 0', () => {
    const r = analyze(series([[P, P + 10], [P, P], [P, P]]));
    expect(r.signals.acceleration.direction).toBe('neutral');
  });

  it('doji breaks a momentum streak (was counted as bearish)', () => {
    expect(analyze(series([[P, P - 10], [P, P], [P, P]])).signals.microMomentum.direction).toBe('neutral');
    expect(analyze(series([[P, P], [P, P], [P, P]])).signals.microMomentum.direction).toBe('neutral');
    expect(analyze(series([[P, P - 10], [P, P - 10], [P, P]])).signals.microMomentum.direction).toBe('bear');
  });

  it('volume surge on a doji confirms nothing', () => {
    const r = analyze(series([
      [P, P + 1, 100], [P, P + 1, 100], [P, P + 1, 100],
      [P, P + 1, 500], [P, P + 1, 500], [P, P, 500], [P, P],
    ]));
    expect(r.signals.volumeSurge.direction).toBe('neutral');
  });

  it('EMA exactly equal → neutral', () => {
    expect(analyze(flat()).signals.ema.direction).toBe('neutral');
  });
});
