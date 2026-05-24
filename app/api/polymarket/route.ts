// Dynamically find the currently active Polymarket BTC 15m market.
// Each market has slug: btc-updown-15m-{closeTimestamp}
// where closeTimestamp is a Unix timestamp aligned to 15-minute boundaries (multiples of 900).
//
// All candidate slugs are fetched in parallel to stay within Vercel's 10s timeout.

interface GammaMarket { outcomePrices?: string; }
interface GammaEvent {
  slug?: string;
  active?: boolean;
  closed?: boolean;
  markets?: GammaMarket[];
}

interface MarketResult { up: number; down: number; slug: string; }

async function fetchSlug(ts: number): Promise<MarketResult> {
  const slug = `btc-updown-15m-${ts}`;
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

export async function GET() {
  const now = Math.floor(Date.now() / 1000);
  const nextBoundary = Math.ceil(now / 900) * 900;
  const candidates = [nextBoundary, nextBoundary + 900, nextBoundary - 900, nextBoundary + 1800];

  // Fetch all candidates in parallel — avoids sequential latency blowing the 10s Vercel timeout
  const settled = await Promise.allSettled(candidates.map(fetchSlug));

  for (const result of settled) {
    if (result.status === 'fulfilled') return Response.json(result.value);
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
