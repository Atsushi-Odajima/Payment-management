import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { authenticatePublicApi, rateLimitHeaders } from "@/lib/public-api/auth";
import { createRefundApiSchema } from "@/lib/public-api/schemas";
import { serializeRefund } from "@/lib/public-api/serialize";
import { createRefundRequest } from "@/lib/refunds/service";

/**
 * POST /api/v1/refunds — request a refund of the merchant's own transaction
 * (Phase L-1). The request goes through the same review as dashboard
 * requests (refund.request audit, admin / accounting decision); the merchant
 * cannot force a refund past its window.
 */
export const POST = withApiHandler(
  async (req) => {
    const ctx = await authenticatePublicApi(prisma, req);
    const parsed = createRefundApiSchema.safeParse(await readJson(req));
    if (!parsed.success) throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])) });
    const payment = await prisma.payment.findFirst({ where: { id: parsed.data.transactionId, merchantId: ctx.merchantId, livemode: ctx.livemode }, select: { id: true, amount: true, amountRefunded: true } });
    if (!payment) throw new ApiError(404, "not_found", "errors.notFound");
    const row = await createRefundRequest(prisma, {
      input: { paymentId: payment.id, amount: parsed.data.amount ?? payment.amount - payment.amountRefunded, reasonCode: parsed.data.reasonCode, reason: parsed.data.reason ?? "", force: false },
      actor: { id: null, role: "cs" },
      audit: ctx.audit,
    });
    return ok(serializeRefund(row), { status: 201, headers: rateLimitHeaders(ctx.rateLimit) });
  },
  { ipRestricted: false },
);
