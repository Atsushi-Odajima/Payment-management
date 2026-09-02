// Applies a payment action atomically and records the audit event.
// Shared by the dashboard API (actor "dashboard") and webhook ingestion
// (actor "webhook").

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

export interface ApplyActionInput {
  paymentId: string;
  action: PaymentAction;
  /** refund only: amount to refund (defaults to the remaining balance) */
  amount?: number;
  /** refund only */
  reason?: string | null;
  actor: "dashboard" | "webhook" | "system";
}

export interface ApplyActionResult {
  id: string;
  status: PaymentStatus;
  amountRefunded: number;
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

  // Refund bookkeeping
  let refundAmount = 0;
  let nextStatus: PaymentStatus = transition.to;
  if (action === "refund") {
    const remaining = payment.amount - payment.amountRefunded;
    refundAmount = input.amount ?? remaining;
    if (!Number.isInteger(refundAmount) || refundAmount <= 0 || refundAmount > remaining) {
      throw new ApiError(400, "refund_exceeds", "errors.refundExceeds", {
        remaining,
      });
    }
    nextStatus = statusAfterRefund(payment.amount, payment.amountRefunded, refundAmount);
  }

  const now = new Date();
  const stamp =
    transition.stampField && (action !== "refund" || nextStatus === "refunded")
      ? { [transition.stampField]: now }
      : {};

  const result = await prisma.$transaction(async (tx) => {
    // Status-conditioned update: if another request moved the payment first,
    // count is 0 and we report a conflict instead of double-applying.
    const updated = await tx.payment.updateMany({
      where: { id: paymentId, status: { in: [...transition.from] } },
      data: {
        status: nextStatus,
        ...(action === "refund" ? { amountRefunded: { increment: refundAmount } } : {}),
        ...stamp,
      },
    });
    if (updated.count === 0) {
      throw new ApiError(409, "invalid_transition", `errors.${transitionErrorKey(action)}`);
    }
    if (action === "refund") {
      await tx.refund.create({
        data: { paymentId, amount: refundAmount, reason: input.reason ?? null },
      });
    }
    await tx.paymentEvent.create({
      data: {
        paymentId,
        type: action,
        fromStatus: current,
        toStatus: nextStatus,
        amount: action === "refund" ? refundAmount : payment.amount,
        actor,
      },
    });
    const fresh = await tx.payment.findUniqueOrThrow({
      where: { id: paymentId },
      select: { id: true, status: true, amountRefunded: true },
    });
    return fresh;
  });

  return {
    id: result.id,
    status: toPaymentStatus(result.status),
    amountRefunded: result.amountRefunded,
  };
}
