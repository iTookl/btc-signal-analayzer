'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  price: number | null;
  updatedAt: number | null;
  candleChange: number | null; // $ change from candle open
}

export default function PriceDisplay({ price, updatedAt, candleChange }: Props) {
  const prevRef    = useRef<number | null>(null);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animKeyRef = useRef(0);
  const [anim, setAnim] = useState<{ dir: 'up' | 'down'; key: number } | null>(null);

  useEffect(() => {
    if (price === null) return;
    const prev = prevRef.current;
    prevRef.current = price;
    if (prev === null || price === prev) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    animKeyRef.current += 1;
    const dir = price > prev ? 'up' : 'down';
    setAnim({ dir, key: animKeyRef.current });
    timerRef.current = setTimeout(() => setAnim(null), 700);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [price]);

  const staleMin = updatedAt
    ? Math.floor((Date.now() / 1000 - updatedAt) / 60)
    : null;

  const changeColor = candleChange !== null
    ? candleChange >= 0 ? '#3d9e6e' : '#e05050'
    : '#8899aa';

  return (
    <div>
      {/* key forces remount on each tick so CSS animation restarts cleanly */}
      <div
        key={anim?.key ?? 0}
        className="text-lg font-bold"
        style={{
          fontFamily: 'monospace',
          display: 'inline-block',
          // No inline color when animating — keyframe must control it
          ...(anim ? {} : { color: '#c8d8e8' }),
          animation: anim ? `price-${anim.dir} 0.7s ease-out` : 'none',
        }}
      >
        {price !== null
          ? `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : '—'}
      </div>

      <div className="flex items-center justify-center gap-2 mt-0.5">
        {candleChange !== null && (
          <span className="text-xs" style={{ color: changeColor, fontFamily: 'monospace' }}>
            {candleChange >= 0 ? '+' : '−'}${Math.abs(candleChange).toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </span>
        )}
        {staleMin !== null && staleMin > 1 && (
          <span className="text-xs" style={{ color: '#4a5a6a', fontFamily: 'monospace' }}>
            ·{staleMin}m ago
          </span>
        )}
      </div>
    </div>
  );
}
