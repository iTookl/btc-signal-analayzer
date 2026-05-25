'use client';

import { SignalHistoryEntry, Lang, Interval } from '@/lib/types';
import { T } from '@/lib/i18n';

interface Props {
  history: SignalHistoryEntry[];
  interval: Interval;
  lang: Lang;
}

export default function SignalHistory({ history, interval, lang }: Props) {
  const isEmpty      = history.length === 0;
  // Win rate counts only directional (bull/bear) entries, not neutral ones
  const directional  = history.filter(e => e.signal !== 'neutral');
  const correct      = directional.filter(e => e.correct).length;
  const winPct       = directional.length === 0 ? null : Math.round((correct / directional.length) * 100);
  const winColor     = winPct === null ? '#4a5a6a' : winPct >= 60 ? '#3d9e6e' : winPct >= 50 ? '#a0a060' : '#e05050';

  return (
    <div className="rounded-xl p-4" style={{ background: '#0f1726', border: '1px solid #1e2d4a' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between text-xs mb-3"
        style={{ color: '#8899aa', fontFamily: 'monospace', letterSpacing: '0.05em' }}
      >
        <span>{T[lang].historyTitle} · {interval.toUpperCase()}</span>
        <span style={{ color: winColor }}>
          {winPct === null ? '—' : `${correct}/${directional.length} (${winPct}%)`}
        </span>
      </div>

      {/* Empty state */}
      {isEmpty && (
        <div className="text-xs py-2" style={{ color: '#4a5a6a', fontFamily: 'monospace' }}>
          {lang === 'ru'
            ? 'Ждём закрытия первой свечи...'
            : 'Waiting for the first candle to close...'}
        </div>
      )}

      {/* Entries */}
      <div className="space-y-1">
        {history.slice(0, 10).map((entry) => {
          const time = new Date(entry.candleTime).toLocaleTimeString([], {
            hour: '2-digit', minute: '2-digit', hour12: false,
          });
          const move     = entry.priceAtClose - entry.priceAtOpen;
          const moveAbs  = Math.abs(Math.round(move)).toLocaleString('en-US');
          const moveStr  = (move >= 0 ? '+$' : '-$') + moveAbs;
          const isNeutral = entry.signal === 'neutral';
          const sigColor  = entry.signal === 'bull' ? '#3d9e6e' : isNeutral ? '#a0a060' : '#e05050';
          const mvColor   = move >= 0 ? '#3d9e6e' : '#e05050';
          const okColor   = isNeutral ? '#4a5a6a' : entry.correct ? '#3d9e6e' : '#e05050';

          return (
            <div
              key={entry.candleTime}
              className="flex items-center gap-3 text-xs"
              style={{ fontFamily: 'monospace' }}
            >
              <span style={{ color: '#8899aa', minWidth: 36 }}>{time}</span>
              <span style={{ color: sigColor, minWidth: 10 }}>
                {isNeutral ? '—' : entry.signal === 'bull' ? '▲' : '▼'}
              </span>
              <span style={{ color: mvColor, flex: 1 }}>{moveStr}</span>
              <span style={{ color: okColor, fontWeight: 'bold' }}>
                {isNeutral ? '·' : entry.correct ? '✓' : '✗'}
              </span>
            </div>
          );
        })}
      </div>

      {history.length < 3 && (
        <div className="text-xs mt-2" style={{ color: '#4a5a6a', fontFamily: 'monospace' }}>
          {lang === 'ru'
            ? 'История накапливается с каждой закрытой свечой'
            : 'History builds with each closed candle'}
        </div>
      )}
    </div>
  );
}
