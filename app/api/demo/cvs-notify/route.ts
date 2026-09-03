import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { applyPaymentAction } from "@/lib/payments/actions";
import { isCvsReceiptNoFormat } from "@/lib/payments/konbini";
import { timingSafeEqualBytes } from "@/lib/auth";
import { requestIp, systemAuditContext } from "@/lib/audit";

const Body = z.object({
  /** The 13-digit receipt number printed on the slip (hyphens allowed). */
  receiptNo: z.string().trim().max(20),
  /** Amount paid at the counter; defaults to the slip amount. */
  amount: z.number().int().positive().max(99_999_999).optional(),
});

/**
 * POST /api/demo/cvs-notify — simulated konbini payment notification (Phase K-1).
 *
 * Mimics the callback a convenience-store payment network sends when the
 * customer pays at the till: looks the transaction up by receipt number and
 * runs the same `deposit` reconciliation as a bank deposit (exact → completed
 * with cvsPaidAt, short → still pending with the short flag).
 *
 * Authentication: `Authorization: Bearer <DEPOSIT_NOTIFY_SECRET>` (shared with
 * the bank notification). Open outside production when the variable is not
 * set, disabled (404) in production.
 */
export const POST = withApiHandler(
  async (req) => {
    const secret = process.env.DEPOSIT_NOTIFY_SECRET;
    if (secret) {
      const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
      const enc = new TextEncoder();
      if (!timingSafeEqualBytes(enc.encode(given), enc.encode(secret))) {
        throw new ApiError(401, "unauthorized", "errors.unauthorized");
      }
    } else if (process.env.NODE_ENV === "production") {
      throw new ApiError(404, "not_found", "errors.notFound");
    }

    const body = Body.parse(await readJson(req));
    const receiptNo = body.receiptNo.replace(/-/g, "");
    const payment = isCvsReceiptNoFormat(receiptNo) ? await prisma.payment.findUnique({ where: { cvsReceiptNo: receiptNo }, select: { id: true, amount: true } }) : null;
    if (!payment) throw new ApiError(404, "receipt_not_found", "errors.cvsReceiptNotFound");

    const result = await applyPaymentAction(prisma, {
      paymentId: payment.id,
      action: "deposit",
      amount: body.amount ?? payment.amount,
      actor: "cvs",
      audit: systemAuditContext("cvs", requestIp(req)),
    });
    return ok({ receiptNo, paymentId: payment.id, amount: payment.amount, received: body.amount ?? payment.amount, depositDiff: result.depositDiff, status: result.status, completed: result.status === "captured" });
  },
  { ipRestricted: false },
);
