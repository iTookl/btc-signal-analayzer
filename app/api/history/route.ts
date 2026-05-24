import { Redis } from '@upstash/redis';
import { SignalHistoryEntry } from '@/lib/types';

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const interval = searchParams.get('interval') === '5m' ? '5m' : '15m';

  const url   = process.env.KV_REST_API_URL   ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return Response.json([]);

  try {
    const redis = new Redis({ url, token });
    const history = (await redis.get<SignalHistoryEntry[]>(`signals:${interval}`)) ?? [];
    return Response.json(history);
  } catch {
    return Response.json([]);
  }
}
