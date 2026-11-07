import { describe, it, expect } from 'vitest';
import { currentWindowStart, slugFor, slugWindowStart, isCurrentSlug, candidateSlugs } from '@/lib/polymarket';
import { applyCandle, klineToCandle } from '@/lib/candles';
import { analyze } from '@/lib/analyzer';
import { RawWindowDelta } from '@/lib/types';
import { candle, series, trend } from './helpers';

describe('lib/polymarket — window math', () => {
  const NOW = 1_794_043_502; // 09:25:02 UTC

  it('current window start = floor(now / step) * step', () => {
    expect(currentWindowStart('15m', NOW)).toBe(1_794_042_900);
    expect(currentWindowStart('5m', NOW)).toBe(1_794_043_500);
  });

  it('a boundary second belongs to the new window', () => {
    expect(currentWindowStart('15m', 1_794_043_800)).toBe(1_794_043_800);
    expect(currentWindowStart('15m', 1_794_043_799)).toBe(1_794_042_900);
  });

  it('candidateSlugs returns only the current window', () => {
    expect(candidateSlugs('15m', NOW)).toEqual(['btc-updown-15m-1794042900']);
  });

  it('slug round-trip and interval check', () => {
    expect(slugWindowStart(slugFor('5m', 123), '5m')).toBe(123);
    expect(slugWindowStart('btc-updown-5m-123', '15m')).toBeNull();
    expect(slugWindowStart('btc-updown-15m-123', '5m')).toBeNull();
    expect(slugWindowStart('btc-updown-15m-12x', '15m')).toBeNull();
  });

  it('isCurrentSlug flips exactly at the window boundary', () => {
    const s = 'btc-updown-15m-1794042900';
    expect(isCurrentSlug(s, '15m', 1_794_042_900)).toBe(true);
    expect(isCurrentSlug(s, '15m', 1_794_043_799)).toBe(true);
    expect(isCurrentSlug(s, '15m', 1_794_043_800)).toBe(false);
    expect(isCurrentSlug(s, '15m', 1_794_042_899)).toBe(false);
  });
});

describe('lib/candles — live candle merge', () => {
  const k = { t: 2000, o: '76139.77', h: '76150', l: '76100', c: '76140.10', v: '12.5' };

  it('klineToCandle keeps Binance open AND close (no other source)', () => {
    expect(klineToCandle(k)).toEqual({ t: 2000, o: 76139.77, h: 76150, l: 76100, c: 76140.10, v: 12.5 });
  });

  it('replaces the last candle of the same period', () => {
    const prev = [candle(1, 2, 1, 1000), candle(3, 4, 1, 2000)];
    const out = applyCandle(prev, klineToCandle(k));
    expect(out).toHaveLength(2);
    expect(out[1].c).toBe(76140.10);
    expect(prev[1].c).toBe(4); // input not mutated
  });

  it('appends a new period and trims to max', () => {
    const prev = Array.from({ length: 50 }, (_, i) => candle(1, 2, 1, i));
    const out = applyCandle(prev, candle(5, 6, 1, 999));
    expect(out).toHaveLength(50);
    expect(out[0].t).toBe(1);
    expect(out.at(-1)!.t).toBe(999);
  });

  it('ignores ticks before REST data has loaded, and stale ticks', () => {
    const empty: ReturnType<typeof applyCandle> = [];
    expect(applyCandle(empty, candle(1, 2, 1, 5))).toBe(empty);
    const prev = [candle(1, 2, 1, 1000), candle(3, 4, 1, 2000)];
    expect(applyCandle(prev, candle(9, 9, 1, 1000))).toBe(prev);
  });

  it('REGRESSION: Window Δ is ~0 when Binance price has not moved', () => {
    // Live check: Binance 76139.77 vs Chainlink 76046.38 (−0.12%).
    // Old code put the Chainlink price into the close → "decisive bear ×7".
    const prev = series([[76_139, 76_139.5]], 25, 76_139);
    const live = klineToCandle({ t: prev.at(-1)!.t + 900_000, o: '76139.77', h: '76140', l: '76139', c: '76139.78', v: '1' });
    const wd = analyze(applyCandle(prev, live)).signals.windowDelta;
    expect((wd.raw as RawWindowDelta).weight).toBe(0);
    expect(wd.direction).toBe('neutral');
  });
});

describe('analyzer — neutral is reachable (threshold fix)', () => {
  it('REGRESSION: choppy market with a flat live candle → neutral / low_score', () => {
    const r = analyze(series([[100_000, 100_005], [100_000, 99_995], [100_000, 100_000]], 30));
    expect(r.signal).toBe('neutral');
    expect(r.neutralReason).toBe('low_score');
    expect(r.agreeCount).toBe(0);
  });

  it('EMA + acceleration alone (|score| ≤ 1.5) never produce a signal', () => {
    for (const step of [-5, 5]) {
      // alternating filler, then two mixed candles and a flat live candle
      const c = series([[100_000, 100_000 + step], [100_000, 100_000 - step], [100_000, 100_000]], 30);
      const r = analyze(c);
      expect(Math.abs(r.score)).toBeLessThanOrEqual(1.5);
      expect(r.signal).toBe('neutral');
    }
  });

  it('one real indicator on top flips it to a signal', () => {
    // same choppy setup, live candle +0.02% → window delta weight 3
    const r = analyze(series([[100_000, 100_005], [100_000, 99_995], [100_000, 100_025]], 30));
    expect(r.signal).toBe('bull');
  });

  it('strong trend still gives a signal', () => {
    expect(analyze(trend(30, 10)).signal).toBe('bull');
    expect(analyze(trend(30, -10)).signal).toBe('bear');
  });
});
