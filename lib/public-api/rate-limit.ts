// Public API rate limit (Phase L-1): 60 requests per minute per merchant and
// environment (test / live), counted in the database so every serverless
// instance shares the window. Old windows are swept opportunistically.

import type { PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/api/handler";

export const PUBLIC_API_RATE_LIMIT = 60;
export const PUBLIC_API_WINDOW_MS = 60_000;

export interface RateLimitOutcome {
  ok: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the window resets. */
  retryAfterSec: number;
  count: number;
}

export function rateLimitKey(merchantId: string, mode: string, now: Date): { id: string; windowStart: Date } {
  const bucket = Math.floor(now.getTime() / PUBLIC_API_WINDOW_MS);
  return { id: `${merchantId}:${mode}:${bucket}`, windowStart: new Date(bucket * PUBLIC_API_WINDOW_MS) };
}

/**
 * Consume one request and throw 429 (Retry-After / X-RateLimit-*) when the
 * merchant × mode budget for the current minute is spent. Shared by /api/v1
 * and /api/merchant-api (Phase P2-3: same bucket, same 60 / minute).
 */
export async function enforceApiRateLimit(db: PrismaClient, opts: { merchantId: string; mode: string; now?: Date }): Promise<RateLimitOutcome> {
  const r = await consumePublicApiRateLimit(db, opts);
  if (!r.ok) {
    throw new ApiError(429, "rate_limited", "errors.rateLimited", undefined, { limit: r.limit, retryAfterSec: r.retryAfterSec }, {
      "retry-after": String(r.retryAfterSec),
      "x-ratelimit-limit": String(r.limit),
      "x-ratelimit-remaining": "0",
    });
  }
  return r;
}

/** Rate-limit headers for successful responses. */
export function rateLimitHeaders(r: RateLimitOutcome): Record<string, string> {
  return { "x-ratelimit-limit": String(r.limit), "x-ratelimit-remaining": String(r.remaining) };
}

export async function consumePublicApiRateLimit(db: PrismaClient, opts: { merchantId: string; mode: string; now?: Date; limit?: number }): Promise<RateLimitOutcome> {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? PUBLIC_API_RATE_LIMIT;
  const { id, windowStart } = rateLimitKey(opts.merchantId, opts.mode, now);
  const row = await db.apiRateLimit.upsert({ where: { id }, create: { id, merchantId: opts.merchantId, windowStart, count: 1 }, update: { count: { increment: 1 } }, select: { count: true } });
  // Sweep windows older than five minutes now and then (cheap; keeps the table tiny).
  if (row.count % 25 === 0) await db.apiRateLimit.deleteMany({ where: { windowStart: { lt: new Date(now.getTime() - 5 * PUBLIC_API_WINDOW_MS) } } }).catch(() => undefined);
  const resetAt = windowStart.getTime() + PUBLIC_API_WINDOW_MS;
  return { ok: row.count <= limit, limit, remaining: Math.max(0, limit - row.count), retryAfterSec: Math.max(1, Math.ceil((resetAt - now.getTime()) / 1000)), count: row.count };
}
