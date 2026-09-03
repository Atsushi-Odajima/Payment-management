// Public API rate limit (Phase L-1): 60 requests per minute per merchant and
// environment (test / live), counted in the database so every serverless
// instance shares the window. Old windows are swept opportunistically.

import type { PrismaClient } from "@prisma/client";

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
