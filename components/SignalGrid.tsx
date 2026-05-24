'use client';

import { SignalResult, Lang, Direction } from '@/lib/types';
import { T, formatSignalValue } from '@/lib/i18n';

interface Props {
  signals: SignalResult['signals'];
  lang: Lang;
}

const DIR_COLOR: Record<Direction, string> = {
  bull: '#3d9e6e',
  bear: '#e05050',
  neutral: '#a0a060',
};

export default function SignalGrid({ signals, lang }: Props) {
  const t = T[lang];
  return (
    <div className="grid grid-cols-2 gap-3">
      {(Object.keys(t.signalLabels) as Array<keyof SignalResult['signals']>).map((key) => {
        const item = signals[key];
        const color = DIR_COLOR[item.direction];
        const value = formatSignalValue(key, item, lang);
        return (
          <div
            key={key}
            className="rounded-lg p-3"
            style={{ background: '#0f1726', border: '1px solid #1e2d4a' }}
          >
            <div className="text-xs font-bold mb-0.5" style={{ color: '#8899aa', fontFamily: 'monospace' }}>
              {t.signalLabels[key]}
            </div>
            <div className="mb-2" style={{ color: '#4a5a6a', fontFamily: 'monospace', fontSize: '10px', lineHeight: '1.4' }}>
              {t.signalDescriptions[key]}
            </div>
            <div
              className="text-sm font-semibold flex items-center gap-1"
              style={{ color, fontFamily: 'monospace' }}
            >
              <span>{t.dirIcon[item.direction]}</span>
              <span>{value}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
