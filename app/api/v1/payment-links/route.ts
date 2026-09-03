import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { createPaymentLink } from "@/lib/payment-links/service";
import { authenticatePublicApi, rateLimitHeaders } from "@/lib/public-api/auth";
import { createPaymentLinkApiSchema } from "@/lib/public-api/schemas";
import { serializePaymentLink } from "@/lib/public-api/serialize";
import { appBaseUrl } from "@/lib/webhooks/deliver";

/** POST /api/v1/payment-links — issue a hosted payment page URL in the key's environment (Phase L-1). */
export const POST = withApiHandler(
  async (req) => {
    const ctx = await authenticatePublicApi(prisma, req);
    const parsed = createPaymentLinkApiSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) });
    const d = parsed.data;
    const row = await createPaymentLink(prisma, {
      input: { merchantId: ctx.merchantId, productName: d.productName, amount: d.amount, description: d.description ?? "", expiresAt: d.expiresAt ?? "", maxUses: d.maxUses ?? null },
      livemode: ctx.livemode,
      actorId: null,
      audit: ctx.audit,
    });
    return ok(serializePaymentLink(row, appBaseUrl()), { status: 201, headers: rateLimitHeaders(ctx.rateLimit) });
  },
  { ipRestricted: false },
);
