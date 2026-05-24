import { Redis } from '@upstash/redis';
import { SignalHistoryEntry } from '@/lib/types';

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const interval = searchParams.get('interval') === '5m' ? '5m' : '15m';

  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return Response.json([]);
  }

  try {
    const redis = Redis.fromEnv();
    const history = (await redis.get<SignalHistoryEntry[]>(`signals:${interval}`)) ?? [];
    return Response.json(history);
  } catch {
    return Response.json([]);
  }
}
