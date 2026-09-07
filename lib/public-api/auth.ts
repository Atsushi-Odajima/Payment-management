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
import { enforceApiRateLimit, type RateLimitOutcome } from "./rate-limit";
export { rateLimitHeaders } from "./rate-limit";

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
  const rateLimit = await enforceApiRateLimit(db, { merchantId: key.merchantId, mode: key.mode, now });
  const ip = clientIpFromHeaders((n) => req.headers.get(n));
  return { key, merchantId: key.merchantId, livemode: key.mode === "live", ip, audit: merchantAuditContext(key.merchantId, ip), rateLimit };
}

