// Try multiple Binance base URLs in parallel — some may be blocked on Vercel/AWS
const BASES = [
  'https://data-api.binance.vision', // public data API, no geo-restriction
  'https://api.binance.com',
  'https://api1.binance.com',
  'https://api2.binance.com',
  'https://api3.binance.com',
];
const PATH = '/api/v3/klines?symbol=BTCUSDT&interval=15m&limit=50';

export async function GET() {
  const attempts = BASES.map(base =>
    fetch(`${base}${PATH}`, { next: { revalidate: 0 } })
      .then(async res => {
        if (!res.ok) throw new Error(`${res.status}`);
        const data: unknown[][] = await res.json();
        return data.map(c => ({
          t: c[0] as number,
          o: +(c[1] as string),
          h: +(c[2] as string),
          l: +(c[3] as string),
          c: +(c[4] as string),
          v: +(c[5] as string),
        }));
      })
  );

  const settled = await Promise.allSettled(attempts);
  for (const r of settled) {
    if (r.status === 'fulfilled') return Response.json(r.value);
  }

  return Response.json({ error: 'all Binance endpoints failed' }, { status: 502 });
}
