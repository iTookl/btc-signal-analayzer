'use client';

import { Direction, Lang } from '@/lib/types';
import { T } from '@/lib/i18n';

interface Props {
  signal: Direction;
  score: number;
  lang: Lang;
}

const SIGNAL_COLOR: Record<Direction, string> = {
  bull: '#3d9e6e',
  bear: '#e05050',
  neutral: '#a0a060',
};

export default function SignalCard({ signal, score, lang }: Props) {
  const t = T[lang];
  const color = SIGNAL_COLOR[signal];
  const cfg = t.signal[signal];

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
      <div className="text-sm mb-3" style={{ color: '#8899aa', fontFamily: 'monospace' }}>
        — {cfg.sub}
      </div>
      <div
        className="inline-block rounded px-3 py-1 text-sm"
        style={{ background: '#0a0e1a', color: '#8899aa', fontFamily: 'monospace' }}
      >
        {t.scoreLabel}:{' '}
        <span style={{ color }}>{score > 0 ? '+' : ''}{score.toFixed(2)}</span>
      </div>
    </div>
  );
}
