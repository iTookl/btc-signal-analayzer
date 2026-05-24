// Dynamically find the currently active Polymarket BTC 15m market.
// Each market has slug: btc-updown-15m-{closeTimestamp}
// where closeTimestamp is a Unix timestamp aligned to 15-minute boundaries (multiples of 900).
export async function GET() {
  const now = Math.floor(Date.now() / 1000);
  const nextBoundary = Math.ceil(now / 900) * 900;
  // Try current window, next window, and previous window in case of slight timing drift
  const candidates = [nextBoundary, nextBoundary + 900, nextBoundary - 900, nextBoundary + 1800];

  for (const ts of candidates) {
    const slug = `btc-updown-15m-${ts}`;
    try {
      const res = await fetch(
        `https://gamma-api.polymarket.com/events?slug=${slug}&limit=1`,
        { next: { revalidate: 0 } }
      );
      if (!res.ok) continue;

      const events: GammaEvent[] = await res.json();
      const event = events?.[0];
      if (!event?.markets?.length) continue;
      if (event.closed === true || event.active === false) continue;

      const market = event.markets[0];
      if (!market.outcomePrices) continue;

      const prices: string[] = JSON.parse(market.outcomePrices);
      const up   = parseFloat(prices[0] ?? 'NaN');
      const down = parseFloat(prices[1] ?? 'NaN');

      if (isNaN(up) || isNaN(down)) continue;
      // Skip already-resolved markets where price has converged to 0 or 1
      if (up < 0.02 || up > 0.98) continue;

      return Response.json({ up, down, slug });
    } catch {
      continue;
    }
  }

  // Fallback: full-text search for any active BTC 15m event
  try {
    const searchRes = await fetch(
      'https://gamma-api.polymarket.com/events?q=BTC+up+or+down+15m&active=true&closed=false&limit=15',
      { next: { revalidate: 0 } }
    );
    if (searchRes.ok) {
      const events: GammaEvent[] = await searchRes.json();
      for (const event of events) {
        if (!event.slug?.includes('btc-updown-15m')) continue;
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

interface GammaMarket { outcomePrices?: string; }
interface GammaEvent {
  slug?: string;
  active?: boolean;
  closed?: boolean;
  markets?: GammaMarket[];
}
