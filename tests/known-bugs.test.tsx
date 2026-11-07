// @vitest-environment jsdom
/**
 * Regression tests for bugs found during review that are NOT fixed yet.
 * They FAIL on the current code and should pass once each bug is fixed.
 * (Fixed bugs move to the regular test files as REGRESSION tests.)
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { analyze } from '@/lib/analyzer';
import PolymarketBar from '@/components/PolymarketBar';
import { trend, series } from './helpers';

afterEach(cleanup);

describe('BUG: zero-movement edge cases are treated as directional', () => {
  it('a completely flat market gives no signal', () => {
    // Today: doji→bear momentum (−2), RSI flat→100 (−2), EMA tie→bear (−1), accel (−0.5) = −5.5
    expect(analyze(trend(40, 0)).signal).toBe('neutral');
  });
  it('RSI of perfectly flat prices is 50/neutral, not 100/overbought', () => {
    expect(analyze(trend(40, 0)).signals.rsi.direction).toBe('neutral');
  });
  it('a doji (close == open) last candle is not counted as bearish acceleration', () => {
    const r = analyze(series([[100_000, 100_010], [100_000, 100_000], [100_000, 100_000]]));
    expect(r.signals.acceleration.direction).not.toBe('bear');
  });
});

describe('BUG: PolymarketBar shows "Error: undefined" while loading', () => {
  it('initial state {up:null, down:null} must not render "undefined"', () => {
    const { container } = render(<PolymarketBar data={{ up: null, down: null }} lang="en" />);
    expect(container.textContent).not.toContain('undefined');
  });
});
