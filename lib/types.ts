export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export type Direction = 'bull' | 'bear' | 'neutral';
export type Lang = 'en' | 'ru';
export type Interval = '5m' | '15m';

export type VolatilityLabel = 'high' | 'squeeze' | 'normal';
export type PatternType = 'bull_engulf' | 'bear_engulf' | 'doji' | 'normal' | 'insufficient';

export interface RawTrend      { up: number; down: number; total: number; }
export interface RawMomentum   { isBull: boolean; isStrong: boolean; }
export interface RawWicks      { upperPct: number; lowerPct: number; }
export interface RawVolatility { label: VolatilityLabel; ratio: number; }
export interface RawPattern    { type: PatternType; }
export interface RawEma        { ema9: number; ema21: number; isBull: boolean; }
export interface RawRSI        { value: number; label: 'overbought' | 'neutral' | 'oversold'; }
export interface RawVolume     { ratio: number; isBull: boolean; }

export type AnyRaw =
  | RawTrend | RawMomentum | RawWicks | RawVolatility
  | RawPattern | RawEma | RawRSI | RawVolume | null;

export interface SignalItem<T extends AnyRaw = AnyRaw> {
  raw: T;
  direction: Direction;
}

export type NeutralReason = 'low_score' | 'low_agreement' | 'no_data' | null;

export interface SignalResult {
  score: number;
  signal: Direction;
  agreeCount: number;
  totalCount: number;
  neutralReason: NeutralReason;
  signals: {
    trend:      SignalItem<RawTrend | null>;
    momentum:   SignalItem<RawMomentum | null>;
    wicks:      SignalItem<RawWicks | null>;
    volatility: SignalItem<RawVolatility | null>;
    pattern:    SignalItem<RawPattern | null>;
    ema:        SignalItem<RawEma | null>;
    rsi:        SignalItem<RawRSI | null>;
    volume:     SignalItem<RawVolume | null>;
  };
}

export interface PolymarketData {
  up: number | null;
  down: number | null;
  error?: string;
}

export type DivergenceType =
  | 'unavailable'
  | 'bull_divergence'
  | 'bear_divergence'
  | 'consensus'
  | 'neutral';

export interface DivergenceResult {
  type: DivergenceType;
  upPct: number | null;
}

export interface SignalHistoryEntry {
  candleTime: number;   // outcome candle open time (ms)
  signal: Direction;    // signal that predicted this candle
  priceAtOpen: number;  // outcome candle open
  priceAtClose: number; // outcome candle close
  correct: boolean;
  interval: Interval;
}
