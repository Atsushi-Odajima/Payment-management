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

export const PAYMENT_ACTORS = ["dashboard", "webhook", "bank", "system", "seed"] as const;
export type PaymentActor = (typeof PAYMENT_ACTORS)[number];

export interface ApplyActionInput {
  paymentId: string;
  action: PaymentAction;
  /** refund: amount to refund (defaults to the remaining balance). deposit: amount received (required). */
  amount?: number;
  /** refund only */
  reason?: string | null;
  actor: Exclude<PaymentActor, "seed">;
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
      depositAmount: true,
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
  } else if (action === "deposit") {
    if (!payment.transferId) throw new ApiError(400, "not_bank_transfer", "errors.notBankTransfer");
    const deposit = input.amount;
    if (deposit === undefined || !Number.isInteger(deposit) || deposit <= 0) {
      throw new ApiError(400, "invalid_input", "errors.depositAmountInvalid");
    }
    const outcome = reconcileDeposit(payment.amount, payment.depositAmount ?? 0, deposit);
    nextStatus = outcome.status;
    eventAmount = deposit;
    extra = { depositAmount: outcome.total, depositDiff: outcome.diff };
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
      await tx.refund.create({
        data: { paymentId, amount: eventAmount, reason: input.reason ?? null },
      });
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
    return tx.payment.findUniqueOrThrow({
      where: { id: paymentId },
      select: { id: true, status: true, amountRefunded: true, depositAmount: true, depositDiff: true },
    });
  });

  return {
    id: result.id,
    status: toPaymentStatus(result.status),
    amountRefunded: result.amountRefunded,
    depositAmount: result.depositAmount,
    depositDiff: result.depositDiff === "short" || result.depositDiff === "excess" ? result.depositDiff : null,
  };
}
