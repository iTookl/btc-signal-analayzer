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

export interface RawWindowDelta { pct: number; weight: number; isBull: boolean; }
export interface RawMicroMomentum { bull1: boolean; bull2: boolean; }
export interface RawAcceleration { currentBody: number; prevBody: number; ratio: number; isBull: boolean; }
export interface RawEma { ema9: number; ema21: number; isBull: boolean; }
export interface RawRSI { value: number; label: 'overbought' | 'neutral' | 'oversold'; }
export interface RawVolumeSurge { ratio: number; isBull: boolean; }
export interface RawTickTrend { bullPct: number; bearPct: number; pctMove: number; isBull: boolean; }

export type AnyRaw =
  | RawWindowDelta | RawMicroMomentum | RawAcceleration
  | RawEma | RawRSI | RawVolumeSurge | RawTickTrend | null;

export interface SignalItem<T extends AnyRaw = AnyRaw> {
  raw: T;
  direction: Direction;
}

export type NeutralReason = 'low_score' | 'no_data' | null;

export interface SignalResult {
  score: number;
  confidence: number;
  signal: Direction;
  agreeCount: number;
  totalCount: number;
  neutralReason: NeutralReason;
  signals: {
    windowDelta:   SignalItem<RawWindowDelta | null>;
    microMomentum: SignalItem<RawMicroMomentum | null>;
    acceleration:  SignalItem<RawAcceleration | null>;
    ema:           SignalItem<RawEma | null>;
    rsi:           SignalItem<RawRSI | null>;
    volumeSurge:   SignalItem<RawVolumeSurge | null>;
    tickTrend:     SignalItem<RawTickTrend | null>;
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
  candleTime: number;
  signal: Direction;
  priceAtOpen: number;
  priceAtClose: number;
  correct: boolean;
  interval: Interval;
}
