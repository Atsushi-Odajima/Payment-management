import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { applyPaymentAction } from "@/lib/payments/actions";
import { timingSafeEqualBytes } from "@/lib/auth";
import { requestIp, systemAuditContext } from "@/lib/audit";

const Body = z.object({
  /** The transfer id the customer wrote on the remittance (7 or 8 digits). */
  transferId: z.string().trim().regex(/^\d{7,8}$/),
  /** Amount received, in yen. */
  amount: z.number().int().positive().max(99_999_999),
});

/**
 * POST /api/demo/deposit-notify — simulated bank deposit notification.
 *
 * Mimics the callback a virtual-account bank sends when money arrives:
 * looks the transaction up by transfer id and runs the same reconciliation
 * as the "Reconcile deposit" button (exact → completed, short → still awaiting with
 * the short flag, excess → completed with the excess flag).
 *
 * Authentication: `Authorization: Bearer <DEPOSIT_NOTIFY_SECRET>`. When the
 * variable is not set the endpoint is open outside production (local demos)
 * and disabled (404) in production. Not admin traffic, so the IP block list
 * does not apply (the middleware also skips CSRF / session for this path).
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
    const payment = await prisma.payment.findUnique({
      where: { transferId: body.transferId },
      select: { id: true, amount: true },
    });
    if (!payment) throw new ApiError(404, "transfer_not_found", "errors.transferNotFound");

    const result = await applyPaymentAction(prisma, {
      paymentId: payment.id,
      action: "deposit",
      amount: body.amount,
      actor: "bank",
      audit: systemAuditContext("bank", requestIp(req)),
    });
    return ok({
      transferId: body.transferId,
      paymentId: payment.id,
      amount: payment.amount,
      received: body.amount,
      depositAmount: result.depositAmount,
      depositDiff: result.depositDiff,
      status: result.status,
      completed: result.status === "captured",
    });
  },
  { ipRestricted: false },
);
