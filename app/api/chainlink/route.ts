// Chainlink BTC/USD price feed on Polygon (Polymarket runs on Polygon).
// Primary: on-chain eth_call via Polygon publicnode (free, no API key).
// Fallback: CoinGecko public API.
//
// Aggregator: 0xc907E116054Ad103354f2D350FD2514433D57F6f (Polygon mainnet BTC/USD)
// Function:   latestRoundData() → (uint80, int256, uint256, uint256, uint80)
// Selector:   0xfeaf968c
// Decimals:   8  → divide by 1e8 to get USD
const POLYGON_AGGREGATOR = '0xc907E116054Ad103354f2D350FD2514433D57F6f';
const LATEST_ROUND_DATA  = '0xfeaf968c';
const POLYGON_RPC        = 'https://polygon.publicnode.com';

async function fromChainlink(): Promise<{ price: number; updatedAt: number }> {
  const res = await fetch(POLYGON_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_call',
      params: [{ to: POLYGON_AGGREGATOR, data: LATEST_ROUND_DATA }, 'latest'],
      id: 1,
    }),
    next: { revalidate: 0 },
  });

  if (!res.ok) throw new Error('RPC HTTP error');
  const json: { result?: string } = await res.json();
  if (!json.result || json.result === '0x') throw new Error('empty result');

  const hex = json.result.slice(2); // strip 0x
  if (hex.length < 320) throw new Error('short response');

  // ABI slots (each 64 hex chars = 32 bytes):
  //   0: roundId   64: answer   128: startedAt   192: updatedAt   256: answeredInRound
  const answerHex    = hex.slice(64, 128);
  const updatedAtHex = hex.slice(192, 256);

  const price     = Number(BigInt('0x' + answerHex)) / 1e8;
  const updatedAt = Number(BigInt('0x' + updatedAtHex));

  if (price < 1_000 || price > 10_000_000) throw new Error('sanity failed');
  return { price, updatedAt };
}

async function fromCoinGecko(): Promise<{ price: number; updatedAt: number }> {
  const res = await fetch(
    'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
    { next: { revalidate: 0 } }
  );
  if (!res.ok) throw new Error('CoinGecko error');
  const data: { bitcoin?: { usd?: number } } = await res.json();
  const price = data?.bitcoin?.usd;
  if (!price) throw new Error('no price');
  return { price, updatedAt: Math.floor(Date.now() / 1000) };
}

export async function GET() {
  try {
    const data = await fromChainlink();
    return Response.json({ ...data, source: 'chainlink' });
  } catch { /* fall through */ }

  try {
    const data = await fromCoinGecko();
    return Response.json({ ...data, source: 'coingecko' });
  } catch { /* fall through */ }

  return Response.json({ price: null, updatedAt: null, error: 'unavailable' }, { status: 502 });
}
