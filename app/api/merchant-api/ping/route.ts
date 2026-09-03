import { prisma } from "@/lib/db";
import { ok, withApiHandler } from "@/lib/api/handler";
import { authenticateMerchantApiKey } from "@/lib/merchants/api-auth";

/**
 * Merchant-facing connection test: `Authorization: Bearer <api key>`.
 * Validates the key (hash lookup, not revoked / expired), applies the
 * merchant's own "merchant API" IP rules, stamps lastUsedAt and reports the
 * merchant and mode the key belongs to. Merchants use it to verify a test
 * key before going live (B-5).
 */
async function handle(req: Request) {
  const key = await authenticateMerchantApiKey(prisma, req);
  return ok({ merchantCode: key.merchantCode, siteName: key.siteName, mode: key.mode, kind: key.kind, keyPrefix: key.keyPrefix, status: key.status });
}

export const GET = withApiHandler(handle, { ipRestricted: false });
export const POST = withApiHandler(handle, { ipRestricted: false });
