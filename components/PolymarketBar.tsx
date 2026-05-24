'use client';

import { PolymarketData, Lang } from '@/lib/types';
import { T } from '@/lib/i18n';

interface Props {
  data: PolymarketData;
  lang: Lang;
}

export default function PolymarketBar({ data, lang }: Props) {
  const t = T[lang];
  const isAvailable = data.up !== null && data.down !== null;
  const upPct = isAvailable ? Math.round(data.up! * 100) : null;
  const downPct = isAvailable ? Math.round(data.down! * 100) : null;

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: '#0f1726', border: '1px solid #1e2d4a' }}
    >
      <div
        className="text-xs mb-3"
        style={{ color: '#8899aa', fontFamily: 'monospace', letterSpacing: '0.05em' }}
      >
        {t.polyTitle}
      </div>

      {!isAvailable ? (
        <div className="text-sm" style={{ color: '#a0a060', fontFamily: 'monospace' }}>
          {data.error === 'unavailable' ? t.polyUnavailable : `${t.polyError}: ${data.error}`}
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-sm mb-1" style={{ fontFamily: 'monospace' }}>
              <span style={{ color: '#3d9e6e' }}>▲ UP</span>
              <span style={{ color: '#3d9e6e' }}>{upPct}%</span>
            </div>
            <div className="w-full rounded-full h-3" style={{ background: '#1e2d4a' }}>
              <div
                className="h-3 rounded-full transition-all duration-500"
                style={{ width: `${upPct}%`, background: '#3d9e6e' }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-sm mb-1" style={{ fontFamily: 'monospace' }}>
              <span style={{ color: '#e05050' }}>▼ DOWN</span>
              <span style={{ color: '#e05050' }}>{downPct}%</span>
            </div>
            <div className="w-full rounded-full h-3" style={{ background: '#1e2d4a' }}>
              <div
                className="h-3 rounded-full transition-all duration-500"
                style={{ width: `${downPct}%`, background: '#e05050' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
