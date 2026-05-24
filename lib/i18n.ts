import {
  Lang, SignalResult, Direction,
  RawTrend, RawMomentum, RawWicks, RawVolatility, RawPattern, RawEma,
  DivergenceResult,
} from './types';

interface Translations {
  title: string;
  loading: string;
  updatedAt: string;
  liveStatus: string;
  priceLabel: string;
  priceSource: string;
  priceStale: string;
  candlesLabel: string;
  intervalLabel: string;
  scoreLabel: string;
  polyTitle: string;
  polyUnavailable: string;
  polyError: string;
  divTitle: string;
  chartLabel: (interval: string) => string;
  footer: string;
  insufficientData: string;
  signal: Record<Direction, { text: string; sub: string }>;
  signalLabels: Record<keyof SignalResult['signals'], string>;
  dirIcon: Record<Direction, string>;
  trend: (r: RawTrend) => string;
  momentum: (r: RawMomentum) => string;
  wicks: (r: RawWicks) => string;
  volatility: (r: RawVolatility) => string;
  pattern: (r: RawPattern) => string;
  ema: (r: RawEma) => string;
  divergence: (d: DivergenceResult) => string;
  marketContext: (bull: number, bear: number, move: number, interval: string) => string;
}

const EN: Translations = {
  title: 'BTC / POLYMARKET ANALYZER',
  loading: 'loading...',
  updatedAt: 'updated',
  liveStatus: 'live',
  priceLabel: 'BTC PRICE',
  priceSource: 'Binance',
  priceStale: 'stale',
  candlesLabel: 'CANDLES',
  intervalLabel: 'interval',
  scoreLabel: 'Score',
  polyTitle: 'POLYMARKET ODDS',
  polyUnavailable: 'Data unavailable',
  polyError: 'Error',
  divTitle: 'DIVERGENCE ANALYSIS',
  chartLabel: (interval) => `BTCUSDT · ${interval} · last 30 candles`,
  footer: 'For analysis only. Not financial advice. TA is probabilistic, not deterministic. Polymarket 15m markets have low volume — odds can be noisy.',
  insufficientData: 'Insufficient data',
  signal: {
    bull:    { text: 'Bullish signal',  sub: 'bias toward growth'   },
    bear:    { text: 'Bearish signal',  sub: 'bias toward decline'  },
    neutral: { text: 'Uncertain',       sub: 'no clear read, coin flip' },
  },
  signalLabels: {
    trend: 'Trend', momentum: 'Momentum', wicks: 'Wicks',
    volatility: 'Volatility', pattern: 'Pattern', ema: 'EMA 9/21',
  },
  dirIcon: { bull: '▲', bear: '▼', neutral: '◆' },
  trend:      (r) => `${r.up}↑ / ${r.down}↓ of ${r.total}`,
  momentum:   (r) => r.isStrong
    ? (r.isBull ? 'Strong bullish' : 'Strong bearish')
    : (r.isBull ? 'Weak bullish'   : 'Weak bearish'),
  wicks:      (r) => `Upper: ${r.upperPct}% / Lower: ${r.lowerPct}%`,
  volatility: (r) => {
    const label = r.label === 'high' ? 'High' : r.label === 'squeeze' ? 'Squeeze' : 'Normal';
    return `${label} (×${r.ratio.toFixed(2)})`;
  },
  pattern:    (r) => ({
    bull_engulf: 'Bullish engulfing',
    bear_engulf: 'Bearish engulfing',
    doji: 'Doji',
    normal: 'Normal',
    insufficient: 'Insufficient data',
  })[r.type],
  ema:        (r) => `EMA9: ${r.ema9.toFixed(0)} / EMA21: ${r.ema21.toFixed(0)}`,
  divergence: (d) => {
    if (d.type === 'unavailable') return 'Polymarket data unavailable';
    const pct = d.upPct!;
    if (d.type === 'bull_divergence') return `⚡ Divergence! Market (${pct}% UP) underprices bullish TA momentum`;
    if (d.type === 'bear_divergence') return `⚡ Divergence! TA is bearish but market prices ${pct}% UP — against the crowd`;
    if (d.type === 'neutral') return `Uncertain. Polymarket: ${pct}% UP / ${100 - pct}% DOWN`;
    return `✓ Consensus confirmed — TA and market agree (${pct}% UP)`;
  },
  marketContext: (bull, _bear, move, interval) => {
    const duration = interval === '5m' ? '25m' : '1h 15m';
    const sign = move >= 0 ? '+' : '−';
    const amt = '$' + Math.abs(Math.round(move)).toLocaleString('en-US');
    if (bull >= 4) return `Rising trend — ${bull}/5 candles bullish (${sign}${amt} over ${duration})`;
    if (bull <= 1) return `Falling trend — ${5 - bull}/5 candles bearish (${sign}${amt} over ${duration})`;
    return `Sideways — ${bull} bullish / ${5 - bull} bearish (${sign}${amt} over ${duration})`;
  },
};

const RU: Translations = {
  title: 'BTC / POLYMARKET ANALYZER',
  loading: 'загрузка...',
  updatedAt: 'обновлено',
  liveStatus: 'прямой эфир',
  priceLabel: 'ЦЕНА BTC',
  priceSource: 'Binance',
  priceStale: 'устарело',
  candlesLabel: 'СВЕЧЕЙ',
  intervalLabel: 'интервал',
  scoreLabel: 'Счёт',
  polyTitle: 'POLYMARKET ODDS',
  polyUnavailable: 'Данные недоступны',
  polyError: 'Ошибка',
  divTitle: 'АНАЛИЗ РАСХОЖДЕНИЙ',
  chartLabel: (interval) => `BTCUSDT · ${interval} · последние 30 свечей`,
  footer: 'Только для анализа. Не является финансовой рекомендацией. Технический анализ вероятностный, а не детерминированный. Polymarket 15m рынки имеют малый объём — котировки могут шуметь.',
  insufficientData: 'Недостаточно данных',
  signal: {
    bull:    { text: 'Бычий сигнал',      sub: 'перевес в сторону роста'   },
    bear:    { text: 'Медвежий сигнал',    sub: 'перевес в сторону падения' },
    neutral: { text: 'Неопределённость',   sub: 'читать нечего, монетка'    },
  },
  signalLabels: {
    trend: 'Тренд', momentum: 'Моментум', wicks: 'Тени',
    volatility: 'Волатильность', pattern: 'Паттерн', ema: 'EMA 9/21',
  },
  dirIcon: { bull: '▲', bear: '▼', neutral: '◆' },
  trend:      (r) => `${r.up}↑ / ${r.down}↓ из ${r.total}`,
  momentum:   (r) => r.isStrong
    ? (r.isBull ? 'Сильный рост'  : 'Сильное падение')
    : (r.isBull ? 'Слабый рост'   : 'Слабое падение'),
  wicks:      (r) => `Верх: ${r.upperPct}% / Низ: ${r.lowerPct}%`,
  volatility: (r) => {
    const label = r.label === 'high' ? 'Высокая' : r.label === 'squeeze' ? 'Сжатие' : 'Норма';
    return `${label} (×${r.ratio.toFixed(2)})`;
  },
  pattern:    (r) => ({
    bull_engulf: 'Бычье поглощение',
    bear_engulf: 'Медвежье поглощение',
    doji: 'Доджи',
    normal: 'Обычная',
    insufficient: 'Недостаточно данных',
  })[r.type],
  ema:        (r) => `EMA9: ${r.ema9.toFixed(0)} / EMA21: ${r.ema21.toFixed(0)}`,
  divergence: (d) => {
    if (d.type === 'unavailable') return 'Данные Polymarket недоступны';
    const pct = d.upPct!;
    if (d.type === 'bull_divergence') return `⚡ Расхождение! Рынок (${pct}% UP) недооценивает бычий импульс ТА`;
    if (d.type === 'bear_divergence') return `⚡ Расхождение! ТА медвежий, но рынок ставит ${pct}% UP — против толпы`;
    if (d.type === 'neutral') return `Неопределённость. Polymarket: ${pct}% UP / ${100 - pct}% DOWN`;
    return `✓ Консенсус подтверждён — ТА и рынок согласны (${pct}% UP)`;
  },
  marketContext: (bull, _bear, move, interval) => {
    const duration = interval === '5m' ? '25м' : '1ч 15м';
    const sign = move >= 0 ? '+' : '−';
    const amt = '$' + Math.abs(Math.round(move)).toLocaleString('ru-RU');
    if (bull >= 4) return `Восходящий тренд — ${bull}/5 свечей бычьи (${sign}${amt} за ${duration})`;
    if (bull <= 1) return `Нисходящий тренд — ${5 - bull}/5 свечей медвежьи (${sign}${amt} за ${duration})`;
    return `Боковик — ${bull} бычьих / ${5 - bull} медвежьих (${sign}${amt} за ${duration})`;
  },
};

export const T: Record<Lang, Translations> = { en: EN, ru: RU };

export function formatSignalValue(
  key: keyof SignalResult['signals'],
  item: SignalResult['signals'][typeof key],
  lang: Lang
): string {
  const t = T[lang];
  if (item.raw === null) return t.insufficientData;
  switch (key) {
    case 'trend':      return t.trend(item.raw as RawTrend);
    case 'momentum':   return t.momentum(item.raw as RawMomentum);
    case 'wicks':      return t.wicks(item.raw as RawWicks);
    case 'volatility': return t.volatility(item.raw as RawVolatility);
    case 'pattern':    return t.pattern(item.raw as RawPattern);
    case 'ema':        return t.ema(item.raw as RawEma);
  }
}
