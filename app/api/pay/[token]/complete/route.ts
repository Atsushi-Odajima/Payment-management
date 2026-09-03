import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { systemAuditContext } from "@/lib/audit";
import { applyPaymentAction } from "@/lib/payments/actions";
import { customerReceiptPath } from "@/lib/receipts/customer-token";

const Body = z.object({ paymentId: z.string().min(1).max(64) });

/**
 * POST /api/pay/:token/complete — demo "pay" button on the hosted page:
 * captures the authorized transaction that the link just created (no real
 * card network in the demo). A konbini slip (Phase K) is settled through the
 * same `deposit` action the store network would trigger. Only transactions of
 * this link can be completed. The response carries the signed receipt URL the
 * customer may download (Phase K-2) — no admin session involved.
 */
export const POST = withApiHandler<{ params: { token: string } }>(
  async (req, { params }) => {
    const { paymentId } = Body.parse(await readJson(req));
    const payment = await prisma.payment.findUnique({ where: { id: paymentId }, select: { id: true, status: true, amount: true, cvsReceiptNo: true, paymentLink: { select: { token: true } } } });
    if (!payment || payment.paymentLink?.token !== params.token) throw new ApiError(404, "not_found", "errors.notFound");
    const result = payment.cvsReceiptNo
      ? await applyPaymentAction(prisma, { paymentId, action: "deposit", amount: payment.amount, actor: "cvs", audit: systemAuditContext("cvs") })
      : await applyPaymentAction(prisma, { paymentId, action: "capture", actor: "system", audit: systemAuditContext("system") });
    const receiptUrl = result.status === "captured" ? await customerReceiptPath(params.token, paymentId) : null;
    return ok({ ...result, receiptUrl });
  },
  { ipRestricted: false },
);
