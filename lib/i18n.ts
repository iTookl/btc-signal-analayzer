import {
  Lang, SignalResult, Direction,
  RawWindowDelta, RawMicroMomentum, RawAcceleration,
  RawEma, RawRSI, RawVolumeSurge, RawTickTrend,
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
  confidenceLabel: string;
  polyTitle: string;
  polyUnavailable: string;
  polyError: string;
  divTitle: string;
  chartLabel: (interval: string) => string;
  footer: string;
  insufficientData: string;
  agreeLabel: (agree: number, total: number) => string;
  historyTitle: string;
  modeSafe: string;
  modeAggressive: string;
  modeDegen: string;
  windowCountdown: (sec: number) => string;
  snipeLabel: string;
  signal: Record<Direction, { text: string; sub: string }>;
  signalLabels: Record<keyof SignalResult['signals'], string>;
  signalDescriptions: Record<keyof SignalResult['signals'], string>;
  dirIcon: Record<Direction, string>;
  windowDelta:   (r: RawWindowDelta) => string;
  microMomentum: (r: RawMicroMomentum) => string;
  acceleration:  (r: RawAcceleration) => string;
  ema:           (r: RawEma) => string;
  rsi:           (r: RawRSI) => string;
  volumeSurge:   (r: RawVolumeSurge) => string;
  tickTrend:     (r: RawTickTrend) => string;
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
  confidenceLabel: 'Confidence',
  polyTitle: 'POLYMARKET ODDS',
  polyUnavailable: 'Data unavailable',
  polyError: 'Error',
  divTitle: 'DIVERGENCE ANALYSIS',
  chartLabel: (interval) => `BTCUSDT · ${interval} · last 30 candles`,
  footer: 'For analysis only. Not financial advice. TA is probabilistic, not deterministic.',
  insufficientData: 'Insufficient data',
  agreeLabel: (agree, total) => total > 0 ? `${agree} of ${total} agree` : 'mixed',
  historyTitle: 'SIGNAL HISTORY',
  modeSafe: 'SAFE',
  modeAggressive: 'AGRO',
  modeDegen: 'DEGEN',
  windowCountdown: (sec) => `T−${sec}s`,
  snipeLabel: 'SNIPE',
  signal: {
    bull:    { text: 'BUY signal',  sub: 'bet UP'   },
    bear:    { text: 'SELL signal', sub: 'bet DOWN'  },
    neutral: { text: 'No signal',  sub: 'coin flip'  },
  },
  signalLabels: {
    windowDelta:   'Window Δ',
    microMomentum: 'Momentum',
    acceleration:  'Acceleration',
    ema:           'EMA 9/21',
    rsi:           'RSI 14',
    volumeSurge:   'Vol Surge',
    tickTrend:     'Tick Trend',
  },
  signalDescriptions: {
    windowDelta:   'Is BTC up or down vs this 5-min window open? The dominant signal.',
    microMomentum: 'Direction of the last 2 closed candles — quick read on momentum',
    acceleration:  'Is the latest candle bigger than 2 candles ago? Accelerating = stronger signal',
    ema:           'Fast EMA(9) vs slow EMA(21) — short-term trend direction',
    rsi:           'RSI 14: above 75 = overbought, below 25 = oversold (extremes weighted ×2)',
    volumeSurge:   'Recent 3-bar avg vol vs prior 3-bar avg. Surge ≥1.5× confirms direction',
    tickTrend:     'Real-time 2s ticks: 60%+ consistency + 0.005%+ move triggers signal',
  },
  dirIcon: { bull: '▲', bear: '▼', neutral: '◆' },
  windowDelta: (r) => {
    const sign = r.isBull ? '+' : '';
    if (r.weight === 0) return `Flat — delta ${sign}${r.pct.toFixed(4)}% (no signal)`;
    if (r.weight >= 7) return `${sign}${r.pct.toFixed(4)}% — decisive, weight ×${r.weight}`;
    if (r.weight >= 5) return `${sign}${r.pct.toFixed(4)}% — strong, weight ×${r.weight}`;
    if (r.weight >= 3) return `${sign}${r.pct.toFixed(4)}% — moderate, weight ×${r.weight}`;
    return `${sign}${r.pct.toFixed(4)}% — slight lean, weight ×${r.weight}`;
  },
  microMomentum: (r) => {
    if (r.bull1 && r.bull2)   return 'Both candles bullish — upward momentum';
    if (!r.bull1 && !r.bull2) return 'Both candles bearish — downward momentum';
    return `Mixed — ${r.bull1 ? 'last↑ prev↓' : 'last↓ prev↑'}, no clear read`;
  },
  acceleration: (r) => {
    if (r.currentBody === 0) return 'Doji — no direction';
    const dir = r.isBull ? 'bullish' : 'bearish';
    if (r.ratio >= 1.3) return `Accelerating ${dir} — ×${r.ratio.toFixed(1)} bigger`;
    if (r.ratio <= 0.7) return `Decelerating ${dir} — ×${r.ratio.toFixed(1)} smaller`;
    return `Similar size ${dir} — ×${r.ratio.toFixed(1)}`;
  },
  ema: (r) => r.isBull
    ? `Fast EMA above slow → upward trend`
    : `Fast EMA below slow → downward trend`,
  rsi: (r) => {
    if (r.value >= 75) return `${r.value} — overbought (×2 weight), pullback likely`;
    if (r.value >= 60) return `${r.value} — elevated, watch for reversal`;
    if (r.value <= 25) return `${r.value} — oversold (×2 weight), bounce likely`;
    if (r.value <= 40) return `${r.value} — low, watch for bounce`;
    return `${r.value} — neutral zone (40–60), no weight`;
  },
  volumeSurge: (r) => {
    const dir = r.isBull ? 'bullish' : 'bearish';
    if (r.ratio >= 1.5) return `Surge ×${r.ratio.toFixed(1)} — confirms ${dir} move`;
    return `Normal ×${r.ratio.toFixed(1)} — no surge`;
  },
  tickTrend: (r) => {
    if (r.pctMove < 0.005) return `Move ${r.pctMove.toFixed(4)}% — too flat for signal`;
    const bull = r.bullPct, bear = r.bearPct;
    if (bull > bear && bull >= 60) return `${bull}% ticks bullish, move ${r.pctMove.toFixed(4)}%`;
    if (bear > bull && bear >= 60) return `${bear}% ticks bearish, move ${r.pctMove.toFixed(4)}%`;
    return `Mixed ${bull}%↑ ${bear}%↓ — no consensus`;
  },
  divergence: (d) => {
    if (d.type === 'unavailable') return 'Polymarket data unavailable';
    const pct = d.upPct!;
    if (d.type === 'bull_divergence') return `⚡ Divergence! Market (${pct}% UP) underprices bullish TA`;
    if (d.type === 'bear_divergence') return `⚡ Divergence! TA bearish but market prices ${pct}% UP`;
    if (d.type === 'neutral') return `Uncertain. Polymarket: ${pct}% UP / ${100 - pct}% DOWN`;
    return `✓ Consensus — TA and market agree (${pct}% UP)`;
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
  confidenceLabel: 'Уверенность',
  polyTitle: 'POLYMARKET ODDS',
  polyUnavailable: 'Данные недоступны',
  polyError: 'Ошибка',
  divTitle: 'АНАЛИЗ РАСХОЖДЕНИЙ',
  chartLabel: (interval) => `BTCUSDT · ${interval} · последние 30 свечей`,
  footer: 'Только для анализа. Не является финансовой рекомендацией. Технический анализ вероятностный.',
  insufficientData: 'Недостаточно данных',
  agreeLabel: (agree, total) => total > 0 ? `${agree} из ${total} согласны` : 'смешано',
  historyTitle: 'ИСТОРИЯ СИГНАЛОВ',
  modeSafe: 'SAFE',
  modeAggressive: 'AGRO',
  modeDegen: 'DEGEN',
  windowCountdown: (sec) => `T−${sec}s`,
  snipeLabel: 'SNIPE',
  signal: {
    bull:    { text: 'Сигнал BUY',   sub: 'ставка UP'    },
    bear:    { text: 'Сигнал SELL',  sub: 'ставка DOWN'   },
    neutral: { text: 'Нет сигнала',  sub: 'монетка'       },
  },
  signalLabels: {
    windowDelta:   'Window Δ',
    microMomentum: 'Моментум',
    acceleration:  'Ускорение',
    ema:           'EMA 9/21',
    rsi:           'RSI 14',
    volumeSurge:   'Объём',
    tickTrend:     'Тики',
  },
  signalDescriptions: {
    windowDelta:   'BTC выше или ниже открытия текущего 5-мин окна? Главный индикатор.',
    microMomentum: 'Направление двух последних закрытых свечей — быстрая оценка импульса',
    acceleration:  'Последняя свеча больше, чем две свечи назад? Ускорение = более сильный сигнал',
    ema:           'Быстрая EMA(9) против медленной EMA(21) — краткосрочный тренд',
    rsi:           'RSI 14: выше 75 = перекуплен, ниже 25 = перепродан (экстремумы с весом ×2)',
    volumeSurge:   'Среднее объёма за 3 бара vs предыдущие 3 бара. Всплеск ≥1.5× подтверждает',
    tickTrend:     'Тики каждые 2с: 60%+ в одну сторону + движение 0.005%+ = сигнал',
  },
  dirIcon: { bull: '▲', bear: '▼', neutral: '◆' },
  windowDelta: (r) => {
    const sign = r.isBull ? '+' : '';
    if (r.weight === 0) return `Плоско — дельта ${sign}${r.pct.toFixed(4)}% (нет сигнала)`;
    if (r.weight >= 7) return `${sign}${r.pct.toFixed(4)}% — решительно, вес ×${r.weight}`;
    if (r.weight >= 5) return `${sign}${r.pct.toFixed(4)}% — сильно, вес ×${r.weight}`;
    if (r.weight >= 3) return `${sign}${r.pct.toFixed(4)}% — умеренно, вес ×${r.weight}`;
    return `${sign}${r.pct.toFixed(4)}% — слабый намёк, вес ×${r.weight}`;
  },
  microMomentum: (r) => {
    if (r.bull1 && r.bull2)   return 'Обе свечи бычьи — восходящий импульс';
    if (!r.bull1 && !r.bull2) return 'Обе свечи медвежьи — нисходящий импульс';
    return `Смешано — ${r.bull1 ? 'посл↑ пред↓' : 'посл↓ пред↑'}, нет чёткого сигнала`;
  },
  acceleration: (r) => {
    if (r.currentBody === 0) return 'Доджи — нет направления';
    const dir = r.isBull ? 'бычье' : 'медвежье';
    if (r.ratio >= 1.3) return `Ускоряется ${dir} — ×${r.ratio.toFixed(1)} крупнее`;
    if (r.ratio <= 0.7) return `Замедляется ${dir} — ×${r.ratio.toFixed(1)} меньше`;
    return `Похожий размер ${dir} — ×${r.ratio.toFixed(1)}`;
  },
  ema: (r) => r.isBull
    ? `Быстрая EMA выше медленной → рост`
    : `Быстрая EMA ниже медленной → падение`,
  rsi: (r) => {
    if (r.value >= 75) return `${r.value} — перекуплен (вес ×2), возможен откат`;
    if (r.value >= 60) return `${r.value} — близко к перекупленности, осторожно`;
    if (r.value <= 25) return `${r.value} — перепродан (вес ×2), возможен отскок`;
    if (r.value <= 40) return `${r.value} — близко к перепроданности, следи`;
    return `${r.value} — нейтральная зона (40–60), нет веса`;
  },
  volumeSurge: (r) => {
    const dir = r.isBull ? 'бычье' : 'медвежье';
    if (r.ratio >= 1.5) return `Всплеск ×${r.ratio.toFixed(1)} — подтверждает ${dir}`;
    return `Обычный ×${r.ratio.toFixed(1)} — всплеска нет`;
  },
  tickTrend: (r) => {
    if (r.pctMove < 0.005) return `Движение ${r.pctMove.toFixed(4)}% — слишком плоско`;
    const bull = r.bullPct, bear = r.bearPct;
    if (bull > bear && bull >= 60) return `${bull}% тиков бычьих, движение ${r.pctMove.toFixed(4)}%`;
    if (bear > bull && bear >= 60) return `${bear}% тиков медвежьих, движение ${r.pctMove.toFixed(4)}%`;
    return `Смешано ${bull}%↑ ${bear}%↓ — нет консенсуса`;
  },
  divergence: (d) => {
    if (d.type === 'unavailable') return 'Данные Polymarket недоступны';
    const pct = d.upPct!;
    if (d.type === 'bull_divergence') return `⚡ Расхождение! Рынок (${pct}% UP) недооценивает бычий ТА`;
    if (d.type === 'bear_divergence') return `⚡ Расхождение! ТА медвежий, но рынок ${pct}% UP`;
    if (d.type === 'neutral') return `Неопределённость. Polymarket: ${pct}% UP / ${100 - pct}% DOWN`;
    return `✓ Консенсус — ТА и рынок согласны (${pct}% UP)`;
  },
  marketContext: (bull, _bear, move, interval) => {
    const duration = interval === '5m' ? '25м' : '1ч 15м';
    const sign = move >= 0 ? '+' : '−';
    const amt = '$' + Math.abs(Math.round(move)).toLocaleString('ru-RU');
    if (bull >= 4) return `Восходящий тренд — ${bull}/5 бычьих (${sign}${amt} за ${duration})`;
    if (bull <= 1) return `Нисходящий тренд — ${5 - bull}/5 медвежьих (${sign}${amt} за ${duration})`;
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
    case 'windowDelta':   return t.windowDelta(item.raw as RawWindowDelta);
    case 'microMomentum': return t.microMomentum(item.raw as RawMicroMomentum);
    case 'acceleration':  return t.acceleration(item.raw as RawAcceleration);
    case 'ema':           return t.ema(item.raw as RawEma);
    case 'rsi':           return t.rsi(item.raw as RawRSI);
    case 'volumeSurge':   return t.volumeSurge(item.raw as RawVolumeSurge);
    case 'tickTrend':     return t.tickTrend(item.raw as RawTickTrend);
  }
}
