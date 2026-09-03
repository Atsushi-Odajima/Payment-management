import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { merchantAuditContext, requestIp } from "@/lib/audit";
import { requireMerchant } from "@/lib/merchant-portal/session";
import { createRefundRequest } from "@/lib/refunds/service";
import { REFUND_REASONS } from "@/lib/refunds/types";

const Body = z.object({
  paymentId: z.string().min(1).max(64),
  amount: z.number().int().positive().max(99_999_999),
  reasonCode: z.enum(REFUND_REASONS),
  reason: z.string().trim().max(500).default(""),
});

/** POST /api/merchant-portal/refunds — the merchant requests a refund of its own transaction (reviewed by the PSP). */
export const POST = withApiHandler(
  async (req) => {
    const merchant = await requireMerchant(prisma, req);
    const body = Body.parse(await readJson(req));
    const payment = await prisma.payment.findFirst({ where: { id: body.paymentId, merchantId: merchant.id }, select: { id: true } });
    if (!payment) throw new ApiError(404, "not_found", "errors.notFound");
    const row = await createRefundRequest(prisma, { input: { ...body, force: false }, actor: { id: null, role: "cs" }, audit: merchantAuditContext(merchant.id, requestIp(req)) });
    return ok({ id: row.id, status: row.status, amount: row.amount }, { status: 201 });
  },
  { ipRestricted: false },
);
