// Public API v1 authentication (Phase L-1): Bearer API key (the same keys
// as the legacy /api/merchant-api endpoints — hash lookup, usable, the
// merchant's own IP rules) plus the per-merchant / per-mode rate limit.
// Every /api/v1 handler starts with authenticatePublicApi(); the merchant and
// the environment come from the key, never from the request body.

import type { PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/api/handler";
import { merchantAuditContext, type AuditContext } from "@/lib/audit";
import { clientIpFromHeaders } from "@/lib/ip";
import { authenticateMerchantApiKey, type MerchantApiIdentity } from "@/lib/merchants/api-auth";
import { consumePublicApiRateLimit, type RateLimitOutcome } from "./rate-limit";

export interface PublicApiContext {
  key: MerchantApiIdentity;
  merchantId: string;
  livemode: boolean;
  ip: string | null;
  audit: AuditContext;
  rateLimit: RateLimitOutcome;
}

export async function authenticatePublicApi(db: PrismaClient, req: Request, now: Date = new Date()): Promise<PublicApiContext> {
  const key = await authenticateMerchantApiKey(db, req);
  if (key.kind !== "api_key") throw new ApiError(401, "invalid_api_key", "errors.invalidApiKey");
  const rateLimit = await consumePublicApiRateLimit(db, { merchantId: key.merchantId, mode: key.mode, now });
  if (!rateLimit.ok) {
    throw new ApiError(429, "rate_limited", "errors.rateLimited", undefined, { limit: rateLimit.limit, retryAfterSec: rateLimit.retryAfterSec }, {
      "retry-after": String(rateLimit.retryAfterSec),
      "x-ratelimit-limit": String(rateLimit.limit),
      "x-ratelimit-remaining": "0",
    });
  }
  const ip = clientIpFromHeaders((n) => req.headers.get(n));
  return { key, merchantId: key.merchantId, livemode: key.mode === "live", ip, audit: merchantAuditContext(key.merchantId, ip), rateLimit };
}

/** Rate-limit headers for successful responses. */
export function rateLimitHeaders(r: RateLimitOutcome): Record<string, string> {
  return { "x-ratelimit-limit": String(r.limit), "x-ratelimit-remaining": String(r.remaining) };
}
