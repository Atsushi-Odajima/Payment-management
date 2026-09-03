import { prisma } from "@/lib/db";
import { ApiError, ok, withApiHandler } from "@/lib/api/handler";
import { API_KEY_SELECT, apiKeyUsable, looksLikeApiKey, toApiKeyView } from "@/lib/merchants/api-keys";
import { hashApiKey } from "@/lib/merchants/api-keys-server";
import { clientIpFromHeaders, evaluateRules } from "@/lib/ip";

/**
 * Merchant-facing connection test: `Authorization: Bearer <api key>`.
 * Validates the key (hash lookup, not revoked / expired), applies the
 * merchant's own "merchant API" IP rules, stamps lastUsedAt and reports the
 * merchant and mode the key belongs to. Merchants use it to verify a test
 * key before going live (B-5).
 */
async function handle(req: Request) {
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!looksLikeApiKey(given)) throw new ApiError(401, "invalid_api_key", "errors.invalidApiKey");
  const key = await prisma.apiKey.findUnique({
    where: { keyHash: hashApiKey(given) },
    select: { ...API_KEY_SELECT, merchant: { select: { merchantCode: true, siteName: true } } },
  });
  if (!key || !apiKeyUsable(key)) throw new ApiError(401, "invalid_api_key", "errors.invalidApiKey");

  const ip = clientIpFromHeaders((n) => req.headers.get(n));
  if (ip) {
    const rules = await prisma.ipRestriction.findMany({ where: { target: "merchant_api", merchantId: key.merchantId, enabled: true }, select: { cidr: true, mode: true } });
    const verdict = evaluateRules(
      ip,
      rules.map((r) => ({ cidr: r.cidr, mode: r.mode === "deny" ? ("deny" as const) : ("allow" as const) })),
    );
    if (verdict.kind === "blocked") throw new ApiError(403, "ip_blocked", "errors.ipBlocked", { ip });
  }
  await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  const view = toApiKeyView(key);
  return ok({ merchantCode: key.merchant.merchantCode, siteName: key.merchant.siteName, mode: view.mode, kind: view.kind, keyPrefix: view.keyPrefix, status: view.status });
}

export const GET = withApiHandler(handle, { ipRestricted: false });
export const POST = withApiHandler(handle, { ipRestricted: false });
