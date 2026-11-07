// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import SignalCard from '@/components/SignalCard';
import SignalHistory from '@/components/SignalHistory';
import PolymarketBar from '@/components/PolymarketBar';
import DivergenceBox from '@/components/DivergenceBox';
import SignalGrid from '@/components/SignalGrid';
import { T, formatSignalValue } from '@/lib/i18n';
import { analyze } from '@/lib/analyzer';
import { SignalHistoryEntry, Lang } from '@/lib/types';
import { trend } from './helpers';

afterEach(cleanup);

describe('i18n', () => {
  it('EN and RU define exactly the same keys', () => {
    const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) =>
      v && typeof v === 'object' ? keys(v).map(s => `${k}.${s}`) : [k]).sort();
    expect(keys(T.ru)).toEqual(keys(T.en));
  });

  it('every signal key has a label and a description', () => {
    for (const lang of ['en', 'ru'] as Lang[]) {
      const sig = Object.keys(analyze([]).signals);
      expect(Object.keys(T[lang].signalLabels).sort()).toEqual(sig.sort());
      expect(Object.keys(T[lang].signalDescriptions).sort()).toEqual(sig.sort());
    }
  });

  it('formatSignalValue never returns "undefined"/"NaN" for real analysis', () => {
    const r = analyze(trend(40, 15), [1, 2, 3, 4, 5, 6].map(i => 100_000 + i * 3));
    for (const lang of ['en', 'ru'] as Lang[]) {
      for (const k of Object.keys(r.signals) as Array<keyof typeof r.signals>) {
        const s = formatSignalValue(k, r.signals[k], lang);
        expect(s).toBeTruthy();
        expect(s).not.toMatch(/undefined|NaN/);
      }
    }
  });

  it('null raw → "insufficient data" text', () => {
    expect(formatSignalValue('tickTrend', { raw: null, direction: 'neutral' }, 'en')).toBe(T.en.insufficientData);
  });

  it('marketContext picks trend wording', () => {
    expect(T.en.marketContext(4, 1, 120, '5m')).toMatch(/^Rising.*\+\$120 over 25m/);
    expect(T.en.marketContext(1, 4, -80, '15m')).toMatch(/^Falling.*−\$80 over 1h 15m/);
    expect(T.en.marketContext(3, 2, 0, '5m')).toMatch(/^Sideways/);
  });

  it('divergence text for each type', () => {
    expect(T.en.divergence({ type: 'unavailable', upPct: null })).toMatch(/unavailable/);
    expect(T.en.divergence({ type: 'bull_divergence', upPct: 40 })).toMatch(/40% UP/);
    expect(T.en.divergence({ type: 'neutral', upPct: 30 })).toMatch(/30% UP \/ 70% DOWN/);
  });
});

describe('<SignalCard>', () => {
  const base = { score: 4.5, confidence: 0.64, agreeCount: 4, totalCount: 7, neutralReason: null, mode: 'safe' as const };

  it('bull: shows BUY text, confidence, agreement and +score', () => {
    const { container } = render(<SignalCard {...base} signal="bull" lang="en" />);
    const txt = container.textContent!;
    expect(txt).toContain('BUY signal');
    expect(txt).toContain('64%');
    expect(txt).toContain('4 of 7 agree');
    expect(txt).toContain('+4.50');
    expect(txt).not.toContain('need');
  });

  it('shows "need X%+" when confidence is below the mode threshold', () => {
    const { container } = render(<SignalCard {...base} confidence={0.1} signal="bear" lang="en" />);
    expect(container.textContent).toContain('need 30%+');
  });

  it('degen mode has no threshold', () => {
    const { container } = render(<SignalCard {...base} confidence={0.01} mode="degen" signal="bear" lang="en" />);
    expect(container.textContent).not.toContain('need');
  });

  it('neutral no_data → loading hint, no agreement badge', () => {
    const { container } = render(<SignalCard {...base} signal="neutral" neutralReason="no_data" lang="ru" />);
    expect(container.textContent).toContain('Загрузка данных');
    expect(container.textContent).not.toContain('согласны');
  });
});

describe('<SignalHistory>', () => {
  const e = (t: number, signal: SignalHistoryEntry['signal'], o: number, c: number, correct: boolean): SignalHistoryEntry =>
    ({ candleTime: t, signal, priceAtOpen: o, priceAtClose: c, correct, interval: '15m' });

  it('empty state', () => {
    const { container } = render(<SignalHistory history={[]} interval="15m" lang="en" />);
    expect(container.textContent).toContain('Waiting for the first candle');
    expect(container.textContent).toContain('—');
  });

  it('win rate ignores neutral entries', () => {
    const h = [e(3, 'bull', 100, 110, true), e(2, 'bear', 100, 110, false), e(1, 'neutral', 100, 90, false)];
    const { container } = render(<SignalHistory history={h} interval="15m" lang="en" />);
    expect(container.textContent).toContain('1/2 (50%)');
    expect(container.textContent).toContain('+$10');
    expect(container.textContent).toContain('-$10');
  });

  it('shows at most 10 rows', () => {
    const h = Array.from({ length: 25 }, (_, i) => e(i * 900_000, 'bull', 1, 2, true));
    const { container } = render(<SignalHistory history={h} interval="15m" lang="en" />);
    expect(container.querySelectorAll('.space-y-1 > div')).toHaveLength(10);
    expect(container.textContent).toContain('25/25 (100%)');
  });
});

describe('<PolymarketBar>', () => {
  it('renders rounded percentages', () => {
    const { container } = render(<PolymarketBar data={{ up: 0.505, down: 0.495 }} lang="en" />);
    expect(container.textContent).toContain('51%');
    expect(container.textContent).toContain('50%');
  });
  it('shows "unavailable" text for error=unavailable', () => {
    const { container } = render(<PolymarketBar data={{ up: null, down: null, error: 'unavailable' }} lang="en" />);
    expect(container.textContent).toContain('Data unavailable');
  });
});

describe('<DivergenceBox> / <SignalGrid>', () => {
  it('DivergenceBox renders the translated text', () => {
    const { container } = render(<DivergenceBox result={{ type: 'consensus', upPct: 70 }} lang="en" />);
    expect(container.textContent).toContain('Consensus');
  });
  it('SignalGrid renders all 7 indicators', () => {
    const r = analyze(trend(40, 15));
    const { container } = render(<SignalGrid signals={r.signals} lang="en" />);
    for (const label of Object.values(T.en.signalLabels)) expect(container.textContent).toContain(label);
  });
});
