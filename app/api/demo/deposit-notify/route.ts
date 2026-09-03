import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import { applyPaymentAction } from "@/lib/payments/actions";
import { timingSafeEqualBytes } from "@/lib/auth";
import { requestIp, systemAuditContext } from "@/lib/audit";
import { registerUnmatchedDeposit } from "@/lib/deposits/service";

const Body = z.object({
  /** The transfer id the customer wrote on the remittance (7 or 8 digits). Missing or unknown → recorded as an unmatched deposit. */
  transferId: z.string().trim().max(20).optional().default(""),
  /** Amount received, in yen. */
  amount: z.number().int().positive().max(99_999_999),
  /** Remitter name as printed on the statement (kept for unmatched deposits). */
  payerName: z.string().trim().max(120).optional().default(""),
  /** Bank-side reference of the deposit line. */
  bankReference: z.string().trim().max(80).optional().default(""),
  /** ISO date-time of the deposit; defaults to now. */
  receivedAt: z.string().trim().max(40).optional().default(""),
  /** Which mode the virtual account belongs to (demo: default test). */
  mode: z.enum(["test", "live"]).optional().default("test"),
});

/**
 * POST /api/demo/deposit-notify — simulated bank deposit notification.
 *
 * Mimics the callback a virtual-account bank sends when money arrives:
 * looks the transaction up by transfer id and runs the same reconciliation
 * as the "Reconcile deposit" button (exact → completed, short → still awaiting with
 * the short flag, excess → completed with the excess flag).
 *
 * A deposit whose transfer id is missing or unknown (the customer forgot it)
 * is not lost: it is recorded as an *unmatched deposit* (202) so support can
 * attach the right transfer id on /unmatched-deposits, which reconciles the
 * transaction and re-notifies the merchant's API.
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
    const audit = systemAuditContext("bank", requestIp(req));
    const payment = /^\d{7,8}$/.test(body.transferId)
      ? await prisma.payment.findUnique({ where: { transferId: body.transferId }, select: { id: true, amount: true, livemode: true } })
      : null;

    if (!payment) {
      const row = await registerUnmatchedDeposit(prisma, {
        input: { amount: body.amount, payerName: body.payerName || "(unknown)", receivedAt: body.receivedAt, bankReference: body.bankReference, givenTransferId: body.transferId, note: "" },
        livemode: body.mode === "live",
        source: "bank",
        audit,
      });
      return ok({ matched: false, transferId: body.transferId || null, unmatchedDepositId: row.id, received: body.amount }, { status: 202 });
    }

    const result = await applyPaymentAction(prisma, {
      paymentId: payment.id,
      action: "deposit",
      amount: body.amount,
      actor: "bank",
      audit,
    });
    return ok({
      matched: true,
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
