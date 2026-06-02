import {
  Candle, Direction, SignalResult, NeutralReason,
  RawWindowDelta, RawMicroMomentum, RawAcceleration,
  RawEma, RawRSI, RawVolumeSurge, RawTickTrend,
  DivergenceResult,
} from './types';

// ── Helpers ───────────────────────────────────────────────────────────────

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

// ── Indicator 1: Window Delta (weight 1–7, dominant) ─────────────────────
// Answers the exact question Polymarket asks: is BTC above window open right now?
// Uses current candle's live close (updated by WebSocket) vs its open.

function calcWindowDelta(candles: Candle[]): { score: number; raw: RawWindowDelta; direction: Direction } {
  const last = candles[candles.length - 1];
  const pct = ((last.c - last.o) / last.o) * 100;
  const absPct = Math.abs(pct);
  const isBull = pct > 0;

  let weight: number;
  if (absPct > 0.10)      weight = 7;
  else if (absPct > 0.02) weight = 5;
  else if (absPct > 0.005) weight = 3;
  else if (absPct > 0.001) weight = 1;
  else                     weight = 0;

  const direction: Direction = weight === 0 ? 'neutral' : isBull ? 'bull' : 'bear';
  return {
    score: (isBull ? 1 : -1) * weight,
    raw: { pct: parseFloat(pct.toFixed(4)), weight, isBull },
    direction,
  };
}

// ── Indicator 2: Micro Momentum (weight 2) ────────────────────────────────
// Direction of the last 2 closed candles. Both up = bull, both down = bear.

function calcMicroMomentum(candles: Candle[]): { score: number; raw: RawMicroMomentum; direction: Direction } {
  const c1 = candles[candles.length - 2]; // last closed
  const c2 = candles[candles.length - 3]; // one before
  const bull1 = c1.c > c1.o;
  const bull2 = c2.c > c2.o;

  let direction: Direction;
  let score: number;

  if (bull1 && bull2)       { direction = 'bull'; score = 2; }
  else if (!bull1 && !bull2) { direction = 'bear'; score = -2; }
  else                       { direction = 'neutral'; score = 0; }

  return { score, raw: { bull1, bull2 }, direction };
}

// ── Indicator 3: Acceleration (weight 1.5) ────────────────────────────────
// Is the last closed candle bigger than the one 2 positions back?
// Accelerating in the same direction = confirming signal.

function calcAcceleration(candles: Candle[]): { score: number; raw: RawAcceleration; direction: Direction } {
  const last = candles[candles.length - 2];
  const prev = candles[candles.length - 3];

  const currentBody = Math.abs(last.c - last.o);
  const prevBody    = Math.abs(prev.c - prev.o);
  const ratio = prevBody > 0 ? currentBody / prevBody : 1;
  const accelerating = ratio > 1;
  const isBull = last.c > last.o;

  // Accelerating in the current direction = confirming; decelerating = weakening
  const score = accelerating ? (isBull ? 1.5 : -1.5) : (isBull ? 0.5 : -0.5);
  const direction: Direction = isBull ? 'bull' : 'bear';

  return { score, raw: { currentBody, prevBody, ratio: parseFloat(ratio.toFixed(2)), isBull }, direction };
}

// ── Indicator 4: EMA Crossover 9/21 (weight 1) ───────────────────────────

function calcEma(candles: Candle[]): { score: number; raw: RawEma; direction: Direction } {
  const closes = candles.map(c => c.c);
  const ema9vals  = ema(closes, 9);
  const ema21vals = ema(closes, 21);
  const ema9  = ema9vals[ema9vals.length - 1];
  const ema21 = ema21vals[ema21vals.length - 1];
  const isBull = ema9 > ema21;
  return { score: isBull ? 1 : -1, raw: { ema9, ema21, isBull }, direction: isBull ? 'bull' : 'bear' };
}

// ── Indicator 5: RSI 14 (weight 1–2 at extremes, 0 neutral) ─────────────
// Overbought >75 and oversold <25 get higher weight. Neutral zone = 0 weight.

function calcRSI(candles: Candle[], period = 14): { score: number; raw: RawRSI; direction: Direction } {
  if (candles.length < period + 2) {
    return { score: 0, raw: { value: 50, label: 'neutral' }, direction: 'neutral' };
  }

  const prices = candles.map(c => c.c);
  const changes: number[] = [];
  for (let i = 1; i < prices.length; i++) changes.push(prices[i] - prices[i - 1]);

  let avgGain = 0, avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss -= changes[i];
  }
  avgGain /= period;
  avgLoss /= period;

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

  if (rsiVal >= 75)      { label = 'overbought'; score = -2; direction = 'bear'; }
  else if (rsiVal >= 60) { label = 'overbought'; score = -1; direction = 'bear'; }
  else if (rsiVal <= 25) { label = 'oversold';   score = 2;  direction = 'bull'; }
  else if (rsiVal <= 40) { label = 'oversold';   score = 1;  direction = 'bull'; }
  else                   { label = 'neutral';    score = 0;  direction = 'neutral'; }

  return { score, raw: { value, label }, direction };
}

// ── Indicator 6: Volume Surge (weight 1) ─────────────────────────────────
// Recent 3-bar avg vs prior 3-bar avg. Surge ≥1.5× confirms current direction.

function calcVolumeSurge(candles: Candle[]): { score: number; raw: RawVolumeSurge; direction: Direction } {
  if (candles.length < 7) {
    return { score: 0, raw: null as unknown as RawVolumeSurge, direction: 'neutral' };
  }

  const recent3 = candles.slice(-4, -1);
  const prior3  = candles.slice(-7, -4);
  const recentAvg = recent3.reduce((s, c) => s + c.v, 0) / 3;
  const priorAvg  = prior3.reduce((s, c)  => s + c.v, 0) / 3;
  const ratio = priorAvg > 0 ? recentAvg / priorAvg : 1;
  const isBull = candles[candles.length - 2].c > candles[candles.length - 2].o;

  if (ratio >= 1.5) {
    return { score: isBull ? 1 : -1, raw: { ratio: parseFloat(ratio.toFixed(2)), isBull }, direction: isBull ? 'bull' : 'bear' };
  }
  return { score: 0, raw: { ratio: parseFloat(ratio.toFixed(2)), isBull }, direction: 'neutral' };
}

// ── Indicator 7: Tick Trend (weight 2) ────────────────────────────────────
// Real-time price ticks: 60%+ directional consistency + >0.005% move triggers signal.

function calcTickTrend(ticks: number[]): { score: number; raw: RawTickTrend | null; direction: Direction } {
  if (ticks.length < 5) return { score: 0, raw: null, direction: 'neutral' };

  let bull = 0, bear = 0;
  for (let i = 1; i < ticks.length; i++) {
    if (ticks[i] > ticks[i - 1]) bull++;
    else if (ticks[i] < ticks[i - 1]) bear++;
  }
  const total = bull + bear;
  if (total === 0) return { score: 0, raw: null, direction: 'neutral' };

  const bullPct = bull / total;
  const bearPct = bear / total;
  const pctMove = Math.abs((ticks[ticks.length - 1] - ticks[0]) / ticks[0]) * 100;

  const isBull = bull > bear;
  const consistency = Math.max(bullPct, bearPct);

  if (consistency >= 0.6 && pctMove >= 0.005) {
    const direction: Direction = isBull ? 'bull' : 'bear';
    return {
      score: isBull ? 2 : -2,
      raw: {
        bullPct: parseFloat((bullPct * 100).toFixed(0)),
        bearPct: parseFloat((bearPct * 100).toFixed(0)),
        pctMove: parseFloat(pctMove.toFixed(4)),
        isBull,
      },
      direction,
    };
  }

  return {
    score: 0,
    raw: {
      bullPct: parseFloat((bullPct * 100).toFixed(0)),
      bearPct: parseFloat((bearPct * 100).toFixed(0)),
      pctMove: parseFloat(pctMove.toFixed(4)),
      isBull,
    },
    direction: 'neutral',
  };
}

// ── Main analysis ──────────────────────────────────────────────────────────

export function analyze(candles: Candle[], ticks: number[] = []): SignalResult {
  const neutral: SignalResult = {
    score: 0, confidence: 0, signal: 'neutral', agreeCount: 0, totalCount: 0,
    neutralReason: 'no_data',
    signals: {
      windowDelta:   { raw: null, direction: 'neutral' },
      microMomentum: { raw: null, direction: 'neutral' },
      acceleration:  { raw: null, direction: 'neutral' },
      ema:           { raw: null, direction: 'neutral' },
      rsi:           { raw: null, direction: 'neutral' },
      volumeSurge:   { raw: null, direction: 'neutral' },
      tickTrend:     { raw: null, direction: 'neutral' },
    },
  };

  // Need enough candles: 21 for EMA seed + RSI 14 + buffer
  if (candles.length < 21) return neutral;

  const windowDelta   = calcWindowDelta(candles);
  const microMomentum = calcMicroMomentum(candles);
  const acceleration  = calcAcceleration(candles);
  const emaResult     = calcEma(candles);
  const rsiResult     = calcRSI(candles);
  const volumeSurge   = calcVolumeSurge(candles);
  const tickTrend     = calcTickTrend(ticks);

  const rawScore =
    windowDelta.score + microMomentum.score + acceleration.score +
    emaResult.score + rsiResult.score + volumeSurge.score + tickTrend.score;

  // Confidence: window delta max weight is 7, normalize against that
  const confidence = Math.min(Math.abs(rawScore) / 7.0, 1.0);

  // Directional signal — needs minimal score to avoid noise
  const THRESHOLD = 0.5;
  let signal: Direction = Math.abs(rawScore) < THRESHOLD ? 'neutral' : rawScore > 0 ? 'bull' : 'bear';

  const directional = [windowDelta, microMomentum, acceleration, emaResult, rsiResult, volumeSurge, tickTrend];
  const agreeCount  = signal !== 'neutral'
    ? directional.filter(s => s.direction === signal).length
    : 0;
  const totalCount  = directional.length;

  let neutralReason: NeutralReason = null;
  if (signal === 'neutral') neutralReason = 'low_score';

  return {
    score: rawScore,
    confidence,
    signal,
    agreeCount,
    totalCount,
    neutralReason,
    signals: {
      windowDelta:   { raw: windowDelta.raw,   direction: windowDelta.direction },
      microMomentum: { raw: microMomentum.raw, direction: microMomentum.direction },
      acceleration:  { raw: acceleration.raw,  direction: acceleration.direction },
      ema:           { raw: emaResult.raw,     direction: emaResult.direction },
      rsi:           { raw: rsiResult.raw,     direction: rsiResult.direction },
      volumeSurge:   { raw: volumeSurge.raw,   direction: volumeSurge.direction },
      tickTrend:     { raw: tickTrend.raw,     direction: tickTrend.direction },
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
