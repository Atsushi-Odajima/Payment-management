// Fixed-window rate limiter, Edge-compatible (no Node APIs).
//
// LIMITATION: state lives in this module's memory, i.e. per serverless
// instance / edge isolate. On Vercel that means the limit is best-effort and
// resets whenever an instance is recycled. For a real multi-instance
// deployment swap the store for Upstash Redis (@upstash/ratelimit) or Vercel
// Firewall rules — the call site in middleware.ts stays the same.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 5000;

export interface RateLimitOptions {
  /** Max requests per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Injectable clock for tests. */
  now?: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function rateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = opts.now ?? Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + opts.windowMs };
    buckets.set(key, bucket);
    if (buckets.size > MAX_KEYS) sweep(now);
  }
  bucket.count += 1;
  const remaining = Math.max(0, opts.limit - bucket.count);
  return {
    ok: bucket.count <= opts.limit,
    remaining,
    retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

function sweep(now: number) {
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}

/** Test helper. */
export function resetRateLimiter() {
  buckets.clear();
}
