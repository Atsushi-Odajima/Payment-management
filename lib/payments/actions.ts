// Applies a payment action atomically and records the audit event.
// Shared by the dashboard API (actor "dashboard"), webhook ingestion
// (actor "webhook") and the bank deposit notification (actor "bank").

import type { PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/api/handler";
import {
  TRANSITIONS,
  canTransition,
  statusAfterRefund,
  toPaymentStatus,
  transitionErrorKey,
  type PaymentAction,
  type PaymentStatus,
} from "./transitions";
import { reconcileDeposit, type DepositDiff } from "./transfer";
import { recordAudit, type AuditContext } from "@/lib/audit";
import { emitPaymentWebhook } from "@/lib/webhooks/deliver";
import { detectRepeatedFailures } from "@/lib/risk/service";
import { notifyMerchantPaymentCompleted, notifyPaymentCompleted, notifyRefundCompleted } from "@/lib/email/hooks";
import type { MerchantWebhookEvent } from "@/lib/webhooks/events";

export const PAYMENT_ACTORS = ["dashboard", "api", "webhook", "bank", "cvs", "system", "seed"] as const;
export type PaymentActor = (typeof PAYMENT_ACTORS)[number];

export interface ApplyActionInput {
  paymentId: string;
  action: PaymentAction;
  /** refund: amount to refund (defaults to the remaining balance). deposit: amount received (required). */
  amount?: number;
  /** refund only */
  reason?: string | null;
  /**
   * refund only: complete an existing refund request (Phase C) instead of
   * creating a completed Refund row. The row's amount is used.
   */
  refund?: { id: string; approvedById: string | null };
  actor: Exclude<PaymentActor, "seed">;
  /** When given, an AuditLog row is written in the same transaction. */
  audit?: AuditContext;
}

export interface ApplyActionResult {
  id: string;
  status: PaymentStatus;
  amountRefunded: number;
  depositAmount: number | null;
  depositDiff: DepositDiff | null;
}

export async function applyPaymentAction(
  prisma: PrismaClient,
  input: ApplyActionInput,
): Promise<ApplyActionResult> {
  const { paymentId, action, actor } = input;
  const transition = TRANSITIONS[action];

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      status: true,
      amount: true,
      amountRefunded: true,
      transferId: true,
      transferDueAt: true,
      cvsReceiptNo: true,
      depositAmount: true,
      merchantId: true,
      livemode: true,
      cardHash: true,
      clientIp: true,
      customerEmail: true,
      provider: { select: { status: true } },
    },
  });
  if (!payment) throw new ApiError(404, "not_found", "errors.notFound");
  if (payment.provider.status !== "active") {
    throw new ApiError(400, "provider_disabled", "errors.providerDisabled");
  }
  const current = toPaymentStatus(payment.status);
  if (!canTransition(current, action)) {
    throw new ApiError(409, "invalid_transition", `errors.${transitionErrorKey(action)}`);
  }

  let nextStatus: PaymentStatus = transition.to;
  let eventAmount = payment.amount;
  let extra: Record<string, unknown> = {};

  // A transfer can only expire once its deadline has passed.
  if (action === "expire" && payment.transferDueAt && payment.transferDueAt.getTime() > Date.now()) {
    throw new ApiError(409, "not_overdue", "errors.notOverdue");
  }

  if (action === "refund") {
    const remaining = payment.amount - payment.amountRefunded;
    const refundAmount = input.amount ?? remaining;
    if (!Number.isInteger(refundAmount) || refundAmount <= 0 || refundAmount > remaining) {
      throw new ApiError(400, "refund_exceeds", "errors.refundExceeds", { remaining });
    }
    nextStatus = statusAfterRefund(payment.amount, payment.amountRefunded, refundAmount);
    eventAmount = refundAmount;
    extra = { amountRefunded: { increment: refundAmount } };
  } else if (action === "deposit" || action === "late_deposit") {
    // Bank transfers carry a transfer id; konbini slips (Phase K) a receipt number.
    const isCvs = payment.cvsReceiptNo !== null;
    if (!payment.transferId && !isCvs) throw new ApiError(400, "not_bank_transfer", "errors.notBankTransfer");
    const deposit = input.amount;
    if (deposit === undefined || !Number.isInteger(deposit) || deposit <= 0) {
      throw new ApiError(400, "invalid_input", "errors.depositAmountInvalid");
    }
    const outcome = reconcileDeposit(payment.amount, payment.depositAmount ?? 0, deposit, isCvs ? "awaiting_payment" : "awaiting_transfer");
    // A late deposit (Phase P1-3) cannot go back to "awaiting": it completes
    // and a short / excess amount is tracked through depositDiff.
    nextStatus = action === "late_deposit" ? "captured" : outcome.status;
    eventAmount = deposit;
    // A short / excess deposit opens a follow-up case (Phase F-3).
    extra = { depositAmount: outcome.total, depositDiff: outcome.diff, depositDiffStatus: outcome.diff ? "open" : null, ...(isCvs && nextStatus === "captured" ? { cvsPaidAt: new Date() } : {}) };
  }

  const now = new Date();
  const stamp = transition.stampField && nextStatus === transition.to ? { [transition.stampField]: now } : {};

  const result = await prisma.$transaction(async (tx) => {
    // Status-conditioned update: if another request moved the payment first,
    // count is 0 and we report a conflict instead of double-applying.
    const updated = await tx.payment.updateMany({
      where: { id: paymentId, status: { in: [...transition.from] } },
      data: { status: nextStatus, ...extra, ...stamp },
    });
    if (updated.count === 0) {
      throw new ApiError(409, "invalid_transition", `errors.${transitionErrorKey(action)}`);
    }
    if (action === "refund") {
      if (input.refund) {
        // Approving a request: the row already exists; mark it completed.
        await tx.refund.update({
          where: { id: input.refund.id },
          data: { status: "completed", completedAt: now, approvedById: input.refund.approvedById },
        });
      } else {
        // Direct refund (webhook / legacy API): recorded as completed at once.
        await tx.refund.create({
          data: {
            paymentId,
            merchantId: payment.merchantId,
            livemode: payment.livemode,
            amount: eventAmount,
            kind: eventAmount >= payment.amount ? "full" : "partial",
            reasonCode: "other",
            reason: input.reason ?? null,
            status: "completed",
            completedAt: now,
          },
        });
      }
    }
    await tx.paymentEvent.create({
      data: {
        paymentId,
        type: action,
        fromStatus: current,
        toStatus: nextStatus,
        amount: eventAmount,
        actor,
      },
    });
    const after = await tx.payment.findUniqueOrThrow({
      where: { id: paymentId },
      select: { id: true, status: true, amountRefunded: true, depositAmount: true, depositDiff: true },
    });
    if (input.audit) {
      await recordAudit(tx, input.audit, {
        action: `payment.${action}`,
        targetType: "payment",
        targetId: paymentId,
        before: { status: current, amountRefunded: payment.amountRefunded, depositAmount: payment.depositAmount },
        after: { status: after.status, amountRefunded: after.amountRefunded, depositAmount: after.depositAmount, depositDiff: after.depositDiff, amount: eventAmount },
      });
    }
    return after;
  });

  // Merchant notification (Phase E) after the commit; never fails the action.
  const event = webhookEventFor(action, toPaymentStatus(result.status));
  if (event && payment.merchantId) await emitPaymentWebhook(prisma, paymentId, event);
  // Customer emails (Phase G-2): completion and refund confirmations.
  const finalStatus = toPaymentStatus(result.status);
  if ((action === "capture" || action === "deposit" || action === "late_deposit") && finalStatus === "captured") {
    await notifyPaymentCompleted(prisma, paymentId);
    // Merchant per-payment notice (Phase P2-2).
    if (payment.merchantId) await notifyMerchantPaymentCompleted(prisma, paymentId);
  }
  if (action === "refund") await notifyRefundCompleted(prisma, paymentId, eventAmount);
  // Repeated-failure detection (Phase F-2) after a failure.
  if (action === "fail") {
    await detectRepeatedFailures(prisma, { cardHash: payment.cardHash, clientIp: payment.clientIp, email: payment.customerEmail }).catch((e) => console.error("[risk] detect failed", e));
  }

  return {
    id: result.id,
    status: toPaymentStatus(result.status),
    amountRefunded: result.amountRefunded,
    depositAmount: result.depositAmount,
    depositDiff: result.depositDiff === "short" || result.depositDiff === "excess" ? result.depositDiff : null,
  };
}

/** Which merchant webhook (if any) an applied action produces. */
export function webhookEventFor(action: PaymentAction, status: PaymentStatus): MerchantWebhookEvent | null {
  switch (action) {
    case "capture":
      return "payment.completed";
    case "deposit":
    case "late_deposit":
      return status === "captured" ? "payment.completed" : null;
    case "fail":
      return "payment.failed";
    case "expire":
      return "payment.expired";
    case "cancel":
      return "payment.cancelled";
    case "refund":
      return "refund.completed";
    default:
      return null;
  }
}
