import {
  Lang, SignalResult, Direction,
  RawTrend, RawMomentum, RawWicks, RawVolatility, RawPattern, RawEma, RawRSI, RawVolume,
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
  agreeLabel: (agree: number, total: number) => string;
  historyTitle: string;
  signal: Record<Direction, { text: string; sub: string }>;
  signalLabels: Record<keyof SignalResult['signals'], string>;
  signalDescriptions: Record<keyof SignalResult['signals'], string>;
  dirIcon: Record<Direction, string>;
  trend:      (r: RawTrend) => string;
  momentum:   (r: RawMomentum) => string;
  wicks:      (r: RawWicks) => string;
  volatility: (r: RawVolatility) => string;
  pattern:    (r: RawPattern) => string;
  ema:        (r: RawEma) => string;
  rsi:        (r: RawRSI) => string;
  volume:     (r: RawVolume) => string;
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
  agreeLabel: (agree, total) => total > 0 ? `${agree} of ${total} indicators agree` : 'mixed signals',
  historyTitle: 'SIGNAL HISTORY',
  signal: {
    bull:    { text: 'Bullish signal',  sub: 'bias toward growth'   },
    bear:    { text: 'Bearish signal',  sub: 'bias toward decline'  },
    neutral: { text: 'Uncertain',       sub: 'no clear read, coin flip' },
  },
  signalLabels: {
    trend: 'Trend', momentum: 'Momentum', wicks: 'Wicks',
    volatility: 'Volatility', pattern: 'Pattern', ema: 'EMA 9/21',
    rsi: 'RSI 14', volume: 'Volume',
  },
  signalDescriptions: {
    trend:      'Last 8 candles: how many went up vs down',
    momentum:   'Is the current candle body bigger or smaller than usual?',
    wicks:      'Long lower wick = buyers resisted; long upper = sellers pushed back',
    volatility: 'Is this candle more or less active than normal?',
    pattern:    'Looks for reversal signals (engulfing candle, doji)',
    ema:        'If the fast average is above the slow one — trend is up, and vice versa',
    rsi:        'Momentum 0–100: above 70 = overheated, below 30 = oversold',
    volume:     'How much BTC was traded vs the last 10 candles average',
  },
  dirIcon: { bull: '▲', bear: '▼', neutral: '◆' },
  trend: (r) => {
    if (r.up >= 6) return `Uptrend — ${r.up} of ${r.total} candles green`;
    if (r.down >= 6) return `Downtrend — ${r.down} of ${r.total} candles red`;
    if (r.up === r.down) return `Sideways — ${r.up}↑ ${r.down}↓, no clear direction`;
    return r.up > r.down
      ? `Slight up — ${r.up}↑ vs ${r.down}↓`
      : `Slight down — ${r.down}↓ vs ${r.up}↑`;
  },
  momentum: (r) => r.isStrong
    ? (r.isBull ? 'Strong bull candle — bigger than usual' : 'Strong bear candle — bigger than usual')
    : (r.isBull ? 'Weak rally — smaller than usual body'   : 'Weak selloff — smaller than usual body'),
  wicks: (r) => {
    if (r.lowerPct >= 30) return `Long lower wick (${r.lowerPct}%) — buyers defended the low`;
    if (r.upperPct >= 30) return `Long upper wick (${r.upperPct}%) — sellers capped the rally`;
    if (r.lowerPct > r.upperPct) return `Lower wick bigger (${r.lowerPct}%) — bullish pressure`;
    if (r.upperPct > r.lowerPct) return `Upper wick bigger (${r.upperPct}%) — selling pressure`;
    return `Wicks balanced — no pressure signal`;
  },
  volatility: (r) => {
    if (r.label === 'high')    return `High volatility — ${r.ratio.toFixed(1)}× above normal`;
    if (r.label === 'squeeze') return `Quiet market — ${(1 / r.ratio).toFixed(1)}× below normal, expect a move`;
    return `Normal activity (×${r.ratio.toFixed(2)})`;
  },
  pattern: (r) => ({
    bull_engulf:  'Bullish engulfing — reversal signal up',
    bear_engulf:  'Bearish engulfing — reversal signal down',
    doji:         'Doji — market indecision',
    normal:       'No pattern found',
    insufficient: 'Not enough data',
  })[r.type],
  ema: (r) => r.isBull
    ? `Fast EMA above slow → upward trend`
    : `Fast EMA below slow → downward trend`,
  rsi: (r) => {
    if (r.value >= 70) return `${r.value} — overbought, pullback likely`;
    if (r.value >= 60) return `${r.value} — slightly elevated, watch for reversal`;
    if (r.value <= 30) return `${r.value} — oversold, bounce likely`;
    if (r.value <= 40) return `${r.value} — slightly low, watch for bounce`;
    return `${r.value} — neutral zone (40–60)`;
  },
  volume: (r) => {
    const dir = r.isBull ? 'bullish' : 'bearish';
    if (r.ratio >= 1.5) return `High ×${r.ratio.toFixed(1)} — confirms ${dir} move`;
    if (r.ratio <= 0.7) return `Low ×${r.ratio.toFixed(1)} — weak move, treat with caution`;
    return `Normal ×${r.ratio.toFixed(1)} — ${dir}`;
  },
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
  agreeLabel: (agree, total) => total > 0 ? `${agree} из ${total} индикаторов согласны` : 'смешанные сигналы',
  historyTitle: 'ИСТОРИЯ СИГНАЛОВ',
  signal: {
    bull:    { text: 'Бычий сигнал',      sub: 'перевес в сторону роста'   },
    bear:    { text: 'Медвежий сигнал',    sub: 'перевес в сторону падения' },
    neutral: { text: 'Неопределённость',   sub: 'читать нечего, монетка'    },
  },
  signalLabels: {
    trend: 'Тренд', momentum: 'Моментум', wicks: 'Тени',
    volatility: 'Волатильность', pattern: 'Паттерн', ema: 'EMA 9/21',
    rsi: 'RSI 14', volume: 'Объём',
  },
  signalDescriptions: {
    trend:      'Последние 8 свечей: сколько выросло, сколько упало',
    momentum:   'Тело текущей свечи больше или меньше обычного?',
    wicks:      'Длинный нижний хвост = покупатели держали; верхний = продавцы давили',
    volatility: 'Текущая свеча активнее или тише нормального уровня?',
    pattern:    'Ищет сигналы разворота: поглощение, доджи',
    ema:        'Если быстрая средняя выше медленной — тренд вверх, и наоборот',
    rsi:        'Индикатор 0–100: выше 70 = рынок перегрет, ниже 30 = перепродан',
    volume:     'Сколько BTC торговалось vs среднее за последние 10 свечей',
  },
  dirIcon: { bull: '▲', bear: '▼', neutral: '◆' },
  trend: (r) => {
    if (r.up >= 6) return `Рост — ${r.up} из ${r.total} свечей зелёных`;
    if (r.down >= 6) return `Падение — ${r.down} из ${r.total} свечей красных`;
    if (r.up === r.down) return `Боковик — ${r.up}↑ ${r.down}↓, направления нет`;
    return r.up > r.down
      ? `Слабый рост — ${r.up}↑ против ${r.down}↓`
      : `Слабое падение — ${r.down}↓ против ${r.up}↑`;
  },
  momentum: (r) => r.isStrong
    ? (r.isBull ? 'Сильная бычья свеча — крупнее обычного' : 'Сильная медвежья свеча — крупнее обычного')
    : (r.isBull ? 'Слабый рост — свеча меньше обычного'    : 'Слабое падение — свеча меньше обычного'),
  wicks: (r) => {
    if (r.lowerPct >= 30) return `Длинная нижняя тень (${r.lowerPct}%) — покупатели сдержали падение`;
    if (r.upperPct >= 30) return `Длинная верхняя тень (${r.upperPct}%) — продавцы давят`;
    if (r.lowerPct > r.upperPct) return `Нижняя тень больше (${r.lowerPct}%) — бычье давление`;
    if (r.upperPct > r.lowerPct) return `Верхняя тень больше (${r.upperPct}%) — давление продавцов`;
    return `Тени симметричны — сигнала нет`;
  },
  volatility: (r) => {
    if (r.label === 'high')    return `Высокая волатильность — в ${r.ratio.toFixed(1)}× выше нормы`;
    if (r.label === 'squeeze') return `Тихий рынок — в ${(1 / r.ratio).toFixed(1)}× тише нормы, жди движения`;
    return `Обычная активность (×${r.ratio.toFixed(2)})`;
  },
  pattern: (r) => ({
    bull_engulf:  'Бычье поглощение — разворот вверх',
    bear_engulf:  'Медвежье поглощение — разворот вниз',
    doji:         'Доджи — рынок не определился',
    normal:       'Паттерн не найден',
    insufficient: 'Недостаточно данных',
  })[r.type],
  ema: (r) => r.isBull
    ? `Быстрая EMA выше медленной → рост`
    : `Быстрая EMA ниже медленной → падение`,
  rsi: (r) => {
    if (r.value >= 70) return `${r.value} — перекуплен, возможен откат`;
    if (r.value >= 60) return `${r.value} — близко к перекупленности, осторожно`;
    if (r.value <= 30) return `${r.value} — перепродан, возможен отскок`;
    if (r.value <= 40) return `${r.value} — близко к перепроданности, следи`;
    return `${r.value} — нейтральная зона (40–60)`;
  },
  volume: (r) => {
    const dir = r.isBull ? 'бычье' : 'медвежье';
    if (r.ratio >= 1.5) return `Высокий ×${r.ratio.toFixed(1)} — подтверждает ${dir} движение`;
    if (r.ratio <= 0.7) return `Низкий ×${r.ratio.toFixed(1)} — слабое движение, осторожно`;
    return `Обычный ×${r.ratio.toFixed(1)} — ${dir}`;
  },
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
    case 'rsi':        return t.rsi(item.raw as RawRSI);
    case 'volume':     return t.volume(item.raw as RawVolume);
  }
}
