'use client';

import { DivergenceResult, Lang } from '@/lib/types';
import { T } from '@/lib/i18n';

interface Props {
  result: DivergenceResult;
  lang: Lang;
}

export default function DivergenceBox({ result, lang }: Props) {
  const t = T[lang];
  const text = t.divergence(result);
  const isDivergence = result.type === 'bull_divergence' || result.type === 'bear_divergence';
  const isConsensus = result.type === 'consensus';
  const color = isDivergence ? '#a0a060' : isConsensus ? '#3d9e6e' : '#8899aa';

  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: '#0f1726',
        border: `1px solid ${isDivergence ? '#a0a06066' : '#1e2d4a'}`,
      }}
    >
      <div
        className="text-xs mb-2"
        style={{ color: '#8899aa', fontFamily: 'monospace', letterSpacing: '0.05em' }}
      >
        {t.divTitle}
      </div>
      <div className="text-sm" style={{ color, fontFamily: 'monospace', lineHeight: 1.6 }}>
        {text}
      </div>
    </div>
  );
}
