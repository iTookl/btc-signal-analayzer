import {
  Candle, Direction, SignalResult, NeutralReason,
  RawTrend, RawMomentum, RawWicks, RawVolatility, RawPattern, RawEma, RawRSI, RawVolume,
  DivergenceResult,
} from './types';

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [];
  let prev = values[0];
  result.push(prev);
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    result.push(prev);
  }
  return result;
}

function calcTrend(candles: Candle[]): { score: number; raw: RawTrend; direction: Direction } {
  const last8 = candles.slice(-8);
  let up = 0; let down = 0;
  for (const c of last8) {
    if (c.c > c.o) up++;
    else if (c.c < c.o) down++;
  }
  const ratio = (up - down) / 8;
  const direction: Direction = ratio > 0.3 ? 'bull' : ratio < -0.3 ? 'bear' : 'neutral';
  return { score: ratio * 2.0, raw: { up, down, total: 8 }, direction };
}

function calcMomentum(candles: Candle[]): { score: number; raw: RawMomentum; direction: Direction } {
  const last = candles[candles.length - 1];
  const last5 = candles.slice(-6, -1);
  const lastBody = Math.abs(last.c - last.o);
  const avgBody = last5.reduce((s, c) => s + Math.abs(c.c - c.o), 0) / last5.length;
  const isStrong = lastBody > avgBody * 1.2;
  const isBull = last.c > last.o;
  const weight = isStrong ? 1.3 : 0.6;
  const direction: Direction = isBull ? 'bull' : 'bear';
  return { score: (isBull ? 1 : -1) * weight, raw: { isBull, isStrong }, direction };
}

function calcWicks(candles: Candle[]): { score: number; raw: RawWicks; direction: Direction } {
  const last = candles[candles.length - 1];
  const range = last.h - last.l;
  if (range === 0) {
    return { score: 0, raw: { upperPct: 0, lowerPct: 0 }, direction: 'neutral' };
  }
  const upper = last.h - Math.max(last.o, last.c);
  const lower = Math.min(last.o, last.c) - last.l;
  const wickBias = (lower - upper) / range;
  const direction: Direction = wickBias > 0.15 ? 'bull' : wickBias < -0.15 ? 'bear' : 'neutral';
  return {
    score: wickBias * 1.5,
    raw: { upperPct: Math.round((upper / range) * 100), lowerPct: Math.round((lower / range) * 100) },
    direction,
  };
}

function calcVolatility(candles: Candle[]): { raw: RawVolatility } {
  const last = candles[candles.length - 1];
  const last20 = candles.slice(-21, -1);
  const lastRange = last.h - last.l;
  const avgRange = last20.reduce((s, c) => s + (c.h - c.l), 0) / last20.length;
  const ratio = avgRange > 0 ? lastRange / avgRange : 1;
  const label = ratio > 1.5 ? 'high' : ratio < 0.5 ? 'squeeze' : 'normal';
  return { raw: { label, ratio } };
}

function calcPattern(candles: Candle[]): { score: number; raw: RawPattern; direction: Direction } {
  const prev = candles[candles.length - 2];
  const last = candles[candles.length - 1];
  const lastBody = Math.abs(last.c - last.o);
  const prevBody = Math.abs(prev.c - prev.o);
  const range = last.h - last.l;

  if (range > 0 && lastBody / range < 0.1) {
    return { score: 0, raw: { type: 'doji' }, direction: 'neutral' };
  }

  const isBullLast = last.c > last.o;
  const isBullPrev = prev.c > prev.o;

  if (isBullLast && !isBullPrev && lastBody > prevBody && last.c > prev.o && last.o < prev.c) {
    return { score: 2.0, raw: { type: 'bull_engulf' }, direction: 'bull' };
  }
  if (!isBullLast && isBullPrev && lastBody > prevBody && last.c < prev.o && last.o > prev.c) {
    return { score: -2.0, raw: { type: 'bear_engulf' }, direction: 'bear' };
  }

  return { score: 0, raw: { type: 'normal' }, direction: 'neutral' };
}

function calcEma(candles: Candle[]): { score: number; raw: RawEma; direction: Direction } {
  const closes = candles.map(c => c.c);
  const ema9vals = ema(closes, 9);
  const ema21vals = ema(closes, 21);
  const ema9 = ema9vals[ema9vals.length - 1];
  const ema21 = ema21vals[ema21vals.length - 1];
  const isBull = ema9 > ema21;
  return { score: isBull ? 0.8 : -0.8, raw: { ema9, ema21, isBull }, direction: isBull ? 'bull' : 'bear' };
}

// Wilder's RSI(14) — proper smoothed calculation
function calcRSI(candles: Candle[], period = 14): { score: number; raw: RawRSI; direction: Direction } {
  if (candles.length < period + 2) {
    return { score: 0, raw: { value: 50, label: 'neutral' }, direction: 'neutral' };
  }

  const prices = candles.map(c => c.c);
  const changes: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }

  // Seed with simple average of first period
  let avgGain = 0, avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss -= changes[i];
  }
  avgGain /= period;
  avgLoss /= period;

  // Wilder smoothing for remaining changes
  for (let i = period; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? -changes[i] : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  const rsiVal = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  const value = Math.round(rsiVal);

  let label: RawRSI['label'];
  let score: number;
  let direction: Direction;

  if (rsiVal >= 70) {
    label = 'overbought'; score = -1.0; direction = 'bear';
  } else if (rsiVal >= 60) {
    label = 'overbought'; score = -0.5; direction = 'bear';
  } else if (rsiVal <= 30) {
    label = 'oversold'; score = 1.0; direction = 'bull';
  } else if (rsiVal <= 40) {
    label = 'oversold'; score = 0.5; direction = 'bull';
  } else {
    label = 'neutral'; score = 0; direction = 'neutral';
  }

  return { score, raw: { value, label }, direction };
}

// Volume vs 10-candle average — high volume confirms direction, low volume weakens it
function calcVolume(candles: Candle[]): { score: number; raw: RawVolume | null; direction: Direction } {
  if (candles.length < 11) {
    return { score: 0, raw: null, direction: 'neutral' };
  }

  const last = candles[candles.length - 1];
  const prev10 = candles.slice(-11, -1);
  const avgVol = prev10.reduce((s, c) => s + c.v, 0) / 10;
  const ratio = avgVol > 0 ? last.v / avgVol : 1;
  const isBull = last.c > last.o;

  let score: number;
  let direction: Direction;

  if (ratio >= 1.5) {
    // High volume confirms current candle direction
    score = isBull ? 0.8 : -0.8;
    direction = isBull ? 'bull' : 'bear';
  } else if (ratio <= 0.7) {
    // Low volume — weak move, don't amplify
    score = 0;
    direction = 'neutral';
  } else {
    // Normal volume — mild confirmation
    score = isBull ? 0.3 : -0.3;
    direction = isBull ? 'bull' : 'bear';
  }

  return { score, raw: { ratio: parseFloat(ratio.toFixed(2)), isBull }, direction };
}

let prevSignal: Direction | null = null;
const THRESHOLD  = 1.2;
const NOISE_GUARD = 0.4;

export function analyze(candles: Candle[]): SignalResult {
  const neutral: SignalResult = {
    score: 0, signal: 'neutral', agreeCount: 0, totalCount: 0,
    neutralReason: 'no_data',
    signals: {
      trend:      { raw: null, direction: 'neutral' },
      momentum:   { raw: null, direction: 'neutral' },
      wicks:      { raw: null, direction: 'neutral' },
      volatility: { raw: null, direction: 'neutral' },
      pattern:    { raw: null, direction: 'neutral' },
      ema:        { raw: null, direction: 'neutral' },
      rsi:        { raw: null, direction: 'neutral' },
      volume:     { raw: null, direction: 'neutral' },
    },
  };

  if (candles.length < 21) return neutral;

  const trend      = calcTrend(candles);
  const momentum   = calcMomentum(candles);
  const wicks      = calcWicks(candles);
  const volatility = calcVolatility(candles);
  const pattern    = calcPattern(candles);
  const emaResult  = calcEma(candles);
  const rsiResult  = calcRSI(candles);
  const volResult  = calcVolume(candles);

  const rawScore =
    trend.score + momentum.score + wicks.score +
    pattern.score + emaResult.score + rsiResult.score + volResult.score;

  let signal: Direction =
    Math.abs(rawScore) < THRESHOLD ? 'neutral' : rawScore > 0 ? 'bull' : 'bear';

  // Noise guard: only prevents a directional signal from dropping to neutral
  // when score dips slightly below threshold (anti-whipsaw).
  // Never overrides a signal that already cleared the threshold.
  if (
    prevSignal !== null &&
    prevSignal !== 'neutral' &&
    signal === 'neutral' &&
    Math.abs(rawScore) > THRESHOLD - NOISE_GUARD
  ) {
    signal = prevSignal;
  }
  prevSignal = signal;

  // Count directional agreement across all 7 indicators (exclude volatility — always neutral)
  const directional = [trend, momentum, wicks, pattern, emaResult, rsiResult, volResult];
  const agreeCount  = signal !== 'neutral'
    ? directional.filter(s => s.direction === signal).length
    : 0;
  const totalCount  = directional.length;

  // Require at least 4/7 indicators to agree — below this threshold signal is too noisy
  const MIN_AGREE = 4;
  let neutralReason: NeutralReason = null;
  if (signal === 'neutral') {
    neutralReason = agreeCount < MIN_AGREE ? 'low_agreement' : 'low_score';
  } else if (agreeCount < MIN_AGREE) {
    signal = 'neutral';
    neutralReason = 'low_agreement';
  }

  return {
    score: rawScore,
    signal,
    agreeCount,
    totalCount,
    neutralReason,
    signals: {
      trend:      { raw: trend.raw,      direction: trend.direction },
      momentum:   { raw: momentum.raw,   direction: momentum.direction },
      wicks:      { raw: wicks.raw,      direction: wicks.direction },
      volatility: { raw: volatility.raw, direction: 'neutral' },
      pattern:    { raw: pattern.raw,    direction: pattern.direction },
      ema:        { raw: emaResult.raw,  direction: emaResult.direction },
      rsi:        { raw: rsiResult.raw,  direction: rsiResult.direction },
      volume:     { raw: volResult.raw,  direction: volResult.direction },
    },
  };
}

export function analyzeDivergence(signal: Direction, upOdds: number | null): DivergenceResult {
  if (upOdds === null) return { type: 'unavailable', upPct: null };
  const upPct = Math.round(upOdds * 100);
  if (signal === 'bull' && upOdds < 0.45) return { type: 'bull_divergence', upPct };
  if (signal === 'bear' && upOdds > 0.55) return { type: 'bear_divergence', upPct };
  if (signal === 'neutral') return { type: 'neutral', upPct };
  return { type: 'consensus', upPct };
}
