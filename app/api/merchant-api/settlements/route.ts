import { prisma } from "@/lib/db";
import { ApiError, ok, withApiHandler } from "@/lib/api/handler";
import { authenticateMerchantApiKey } from "@/lib/merchants/api-auth";
import { loadMerchantSettlements, loadSettlement } from "@/lib/settlements/list";

/**
 * Merchant-facing settlement view (the merchant's own batches and lines):
 *   GET /api/merchant-api/settlements            → own batches of the key's mode
 *   GET /api/merchant-api/settlements?id=<batch> → one batch with its lines
 * Authenticated with the merchant's Bearer API key, like /ping.
 */
export const GET = withApiHandler(
  async (req) => {
    const key = await authenticateMerchantApiKey(prisma, req);
    const id = new URL(req.url).searchParams.get("id");
    if (id) {
      const data = await loadSettlement(id);
      if (!data || data.batch.merchant.id !== key.merchantId || data.batch.livemode !== (key.mode === "live")) {
        throw new ApiError(404, "not_found", "errors.notFound");
      }
      return ok(data);
    }
    const batches = await loadMerchantSettlements(key.merchantId, key.mode, 100);
    return ok({ merchantCode: key.merchantCode, mode: key.mode, settlements: batches });
  },
  { ipRestricted: false },
);
