// @vitest-environment jsdom
/**
 * Regression tests for bugs found during review that are NOT fixed yet.
 * They FAIL on the current code and should pass once each bug is fixed.
 * (Fixed bugs move to the regular test files as REGRESSION tests.)
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import PolymarketBar from '@/components/PolymarketBar';

afterEach(cleanup);

describe('BUG: PolymarketBar shows "Error: undefined" while loading', () => {
  it('initial state {up:null, down:null} must not render "undefined"', () => {
    const { container } = render(<PolymarketBar data={{ up: null, down: null }} lang="en" />);
    expect(container.textContent).not.toContain('undefined');
  });
});
