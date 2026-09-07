// Bearer authentication for the merchant-facing API (/api/merchant-api/*):
// look the key up by hash, check it is usable, apply the merchant's own
// "merchant API" IP rules and stamp lastUsedAt. Shared by ping, settlements,
// announcements and the public API v1 (which adds its own rate-limit call).
// authenticateMerchantApi() below also applies the shared 60 / minute rate
// limit (Phase P2-3, same bucket as /api/v1).

import type { PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/api/handler";
import { clientIpFromHeaders, evaluateRules } from "@/lib/ip";
import { API_KEY_SELECT, apiKeyUsable, looksLikeApiKey, toApiKeyView, type ApiKeyView } from "./api-keys";
import { hashApiKey } from "./api-keys-server";
import { enforceApiRateLimit, rateLimitHeaders, type RateLimitOutcome } from "@/lib/public-api/rate-limit";

export interface MerchantApiIdentity extends ApiKeyView {
  merchantId: string;
  merchantCode: string;
  siteName: string;
}

export async function authenticateMerchantApiKey(db: PrismaClient, req: Request): Promise<MerchantApiIdentity> {
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!looksLikeApiKey(given)) throw new ApiError(401, "invalid_api_key", "errors.invalidApiKey");
  const key = await db.apiKey.findUnique({
    where: { keyHash: hashApiKey(given) },
    select: { ...API_KEY_SELECT, merchant: { select: { merchantCode: true, siteName: true } } },
  });
  if (!key || !apiKeyUsable(key)) throw new ApiError(401, "invalid_api_key", "errors.invalidApiKey");

  const ip = clientIpFromHeaders((n) => req.headers.get(n));
  if (ip) {
    const rules = await db.ipRestriction.findMany({ where: { target: "merchant_api", merchantId: key.merchantId, enabled: true }, select: { cidr: true, mode: true } });
    const verdict = evaluateRules(
      ip,
      rules.map((r) => ({ cidr: r.cidr, mode: r.mode === "deny" ? ("deny" as const) : ("allow" as const) })),
    );
    if (verdict.kind === "blocked") throw new ApiError(403, "ip_blocked", "errors.ipBlocked", { ip });
  }
  await db.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  return { ...toApiKeyView(key), merchantId: key.merchantId, merchantCode: key.merchant.merchantCode, siteName: key.merchant.siteName };
}

/** Key auth + the shared merchant × mode rate limit; `headers` go on the successful response. */
export async function authenticateMerchantApi(db: PrismaClient, req: Request, now: Date = new Date()): Promise<{ key: MerchantApiIdentity; rateLimit: RateLimitOutcome; headers: Record<string, string> }> {
  const key = await authenticateMerchantApiKey(db, req);
  const rateLimit = await enforceApiRateLimit(db, { merchantId: key.merchantId, mode: key.mode, now });
  return { key, rateLimit, headers: rateLimitHeaders(rateLimit) };
}
