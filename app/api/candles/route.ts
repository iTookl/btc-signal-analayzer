export async function GET() {
  try {
    const res = await fetch(
      'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=15m&limit=50',
      { next: { revalidate: 0 } }
    );
    if (!res.ok) {
      return Response.json({ error: 'Binance error' }, { status: 502 });
    }
    const data: unknown[][] = await res.json();
    const candles = data.map((c) => ({
      t: c[0] as number,
      o: +(c[1] as string),
      h: +(c[2] as string),
      l: +(c[3] as string),
      c: +(c[4] as string),
      v: +(c[5] as string),
    }));
    return Response.json(candles);
  } catch {
    return Response.json({ error: 'Failed to fetch candles' }, { status: 500 });
  }
}
