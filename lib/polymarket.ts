import { Interval } from './types';

// Polymarket BTC Up/Down slugs: btc-updown-{5m|15m}-{ts}, where ts is the
// window START (unix seconds). The market for "now" is the one whose window
// [ts, ts + step) contains now.

export function intervalSeconds(interval: Interval): number {
  return interval === '5m' ? 300 : 900;
}

/** Unix-seconds start of the window that contains `nowSec`. */
export function currentWindowStart(interval: Interval, nowSec: number): number {
  const step = intervalSeconds(interval);
  return Math.floor(nowSec / step) * step;
}

export function slugFor(interval: Interval, windowStart: number): string {
  return `btc-updown-${interval}-${windowStart}`;
}

/** Window start encoded in a slug, or null if the slug isn't for this interval. */
export function slugWindowStart(slug: string, interval: Interval): number | null {
  const m = new RegExp(`^btc-updown-${interval}-(\\d+)$`).exec(slug);
  return m ? Number(m[1]) : null;
}

/** True if `slug` is the market for the window containing `nowSec`. */
export function isCurrentSlug(slug: string, interval: Interval, nowSec: number): boolean {
  return slugWindowStart(slug, interval) === currentWindowStart(interval, nowSec);
}

/**
 * Slugs to try. Only the current window: the next window's market is already
 * listed but its odds are for a different period, so showing it is wrong.
 */
export function candidateSlugs(interval: Interval, nowSec: number): string[] {
  return [slugFor(interval, currentWindowStart(interval, nowSec))];
}
