// Dynamically find the currently active Polymarket BTC Up/Down market.
// Supports both 5m (300s boundaries) and 15m (900s boundaries).
// Slug formats: btc-updown-5m-{ts} and btc-updown-15m-{ts}

interface GammaMarket { outcomePrices?: string; }
interface GammaEvent {
  slug?: string;
  active?: boolean;
  closed?: boolean;
  markets?: GammaMarket[];
}

interface MarketResult { up: number; down: number; slug: string; }

async function fetchSlug(slug: string): Promise<MarketResult> {
  const res = await fetch(
    `https://gamma-api.polymarket.com/events?slug=${slug}&limit=1`,
    { next: { revalidate: 0 } }
  );
  if (!res.ok) throw new Error('not ok');

  const events: GammaEvent[] = await res.json();
  const event = events?.[0];
  if (!event?.markets?.length) throw new Error('no markets');
  if (event.closed === true || event.active === false) throw new Error('inactive');

  const market = event.markets[0];
  if (!market.outcomePrices) throw new Error('no prices');

  const prices: string[] = JSON.parse(market.outcomePrices);
  const up   = parseFloat(prices[0] ?? 'NaN');
  const down = parseFloat(prices[1] ?? 'NaN');
  if (isNaN(up) || isNaN(down)) throw new Error('nan');
  if (up < 0.02 || up > 0.98) throw new Error('resolved');

  return { up, down, slug };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const interval = searchParams.get('interval') === '5m' ? '5m' : '15m';
  const step = interval === '5m' ? 300 : 900;
  const prefix = `btc-updown-${interval}-`;

  const now = Math.floor(Date.now() / 1000);
  const nextBoundary = Math.ceil(now / step) * step;
  const candidates = [nextBoundary, nextBoundary + step, nextBoundary - step, nextBoundary + step * 2]
    .map(ts => `${prefix}${ts}`);

  const settled = await Promise.allSettled(candidates.map(fetchSlug));

  for (const result of settled) {
    if (result.status === 'fulfilled') return Response.json(result.value);
  }

  // Fallback: full-text search for any active BTC Up/Down event of this interval
  try {
    const searchRes = await fetch(
      `https://gamma-api.polymarket.com/events?q=BTC+up+or+down+${interval}&active=true&closed=false&limit=15`,
      { next: { revalidate: 0 } }
    );
    if (searchRes.ok) {
      const events: GammaEvent[] = await searchRes.json();
      for (const event of events) {
        if (!event.slug?.includes(`btc-updown-${interval}-`)) continue;
        if (!event.markets?.length) continue;
        const market = event.markets[0];
        if (!market.outcomePrices) continue;
        const prices: string[] = JSON.parse(market.outcomePrices);
        const up   = parseFloat(prices[0] ?? 'NaN');
        const down = parseFloat(prices[1] ?? 'NaN');
        if (isNaN(up) || isNaN(down) || up < 0.02 || up > 0.98) continue;
        return Response.json({ up, down, slug: event.slug });
      }
    }
  } catch { /* fallback failed */ }

  return Response.json({ up: null, down: null, error: 'no_active_market' });
}
