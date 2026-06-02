'use client';

import { Direction, Lang, NeutralReason } from '@/lib/types';
import { T } from '@/lib/i18n';

export type TradeMode = 'safe' | 'aggressive' | 'degen';

const MODE_THRESHOLD: Record<TradeMode, number> = {
  safe:       0.30,
  aggressive: 0.20,
  degen:      0.00,
};

interface Props {
  signal: Direction;
  score: number;
  confidence: number;
  lang: Lang;
  agreeCount: number;
  totalCount: number;
  neutralReason: NeutralReason;
  mode: TradeMode;
}

const SIGNAL_COLOR: Record<Direction, string> = {
  bull:    '#3d9e6e',
  bear:    '#e05050',
  neutral: '#a0a060',
};

export default function SignalCard({ signal, score, confidence, lang, agreeCount, totalCount, neutralReason, mode }: Props) {
  const t = T[lang];
  const color = SIGNAL_COLOR[signal];
  const cfg = t.signal[signal];

  const threshold = MODE_THRESHOLD[mode];
  const meetsThreshold = confidence >= threshold;
  const confidencePct = Math.round(confidence * 100);

  const neutralHint =
    signal === 'neutral' && neutralReason === 'no_data'
      ? (lang === 'ru' ? 'Загрузка данных...' : 'Loading data...')
      : signal === 'neutral'
      ? (lang === 'ru' ? 'Счёт ниже порога — нет сигнала' : 'Score below threshold — no signal')
      : null;

  const barColor = meetsThreshold ? color : '#4a5a6a';

  return (
    <div
      className="rounded-xl p-6 text-center"
      style={{
        background: '#0f1726',
        border: `2px solid ${color}`,
        boxShadow: `0 0 24px ${color}33`,
      }}
    >
      <div className="text-5xl mb-3">
        {signal === 'bull' ? '🟢' : signal === 'bear' ? '🔴' : '🟡'}
      </div>
      <div className="text-2xl font-bold mb-1" style={{ color, fontFamily: 'monospace' }}>
        {cfg.text}
      </div>
      <div className="text-sm mb-1" style={{ color: '#8899aa', fontFamily: 'monospace' }}>
        — {cfg.sub}
      </div>
      {neutralHint && (
        <div className="text-xs mb-2" style={{ color: '#4a5a6a', fontFamily: 'monospace' }}>
          {neutralHint}
        </div>
      )}

      {/* Confidence bar */}
      <div className="mt-3 mb-3">
        <div className="flex justify-between items-center mb-1">
          <span style={{ color: '#8899aa', fontSize: '11px', fontFamily: 'monospace' }}>
            {t.confidenceLabel}
          </span>
          <span style={{ color: meetsThreshold ? color : '#4a5a6a', fontSize: '11px', fontFamily: 'monospace', fontWeight: 'bold' }}>
            {confidencePct}%
            {!meetsThreshold && signal !== 'neutral' && (
              <span style={{ color: '#4a5a6a', marginLeft: '4px' }}>
                (need {Math.round(threshold * 100)}%+)
              </span>
            )}
          </span>
        </div>
        <div style={{ background: '#1e2d4a', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
          <div
            style={{
              background: barColor,
              width: `${confidencePct}%`,
              height: '100%',
              borderRadius: '4px',
              transition: 'width 0.4s ease',
              boxShadow: meetsThreshold ? `0 0 6px ${color}88` : 'none',
            }}
          />
        </div>
        {/* Mode threshold markers */}
        <div style={{ position: 'relative', height: '8px', marginTop: '2px' }}>
          {/* Safe 30% */}
          <div style={{ position: 'absolute', left: '30%', top: 0, width: '1px', height: '6px', background: '#3d9e6e44' }} />
          {/* Aggressive 20% */}
          <div style={{ position: 'absolute', left: '20%', top: 0, width: '1px', height: '6px', background: '#a0a06044' }} />
        </div>
      </div>

      {/* Score + agreement row */}
      <div className="flex items-center justify-center gap-3 flex-wrap">
        {signal !== 'neutral' && totalCount > 0 && (
          <div
            className="rounded px-3 py-1 text-sm"
            style={{ background: '#0a0e1a', fontFamily: 'monospace' }}
          >
            <span style={{ color }}>
              {agreeCount}
            </span>
            <span style={{ color: '#8899aa' }}>
              {' '}{lang === 'ru' ? `из ${totalCount} согласны` : `of ${totalCount} agree`}
            </span>
          </div>
        )}
        <div
          className="rounded px-3 py-1 text-sm"
          style={{ background: '#0a0e1a', color: '#8899aa', fontFamily: 'monospace' }}
        >
          {t.scoreLabel}:{' '}
          <span style={{ color }}>{score > 0 ? '+' : ''}{score.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
