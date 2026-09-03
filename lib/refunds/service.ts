// Refund request flow (Phase C): request → approve (payment moves through the
// state machine and the row becomes completed) / reject. Validation covers
// the refundable balance (minus pending requests) and the merchant's refund
// window, which only a master may override with a reason.

import type { PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/api/handler";
import { recordAudit, type AuditContext } from "@/lib/audit";
import { applyPaymentAction } from "@/lib/payments/actions";
import { PENDING_REFUND_STATUSES, type RefundRequestInput } from "./types";

export interface RefundActor {
  id: string;
  role: "master" | "general";
}

export const REFUND_SELECT = {
  id: true,
  paymentId: true,
  merchantId: true,
  livemode: true,
  amount: true,
  kind: true,
  reasonCode: true,
  reason: true,
  status: true,
  forced: true,
  decisionNote: true,
  createdAt: true,
  completedAt: true,
  requestedBy: { select: { id: true, loginId: true, name: true } },
  approvedBy: { select: { id: true, loginId: true, name: true } },
} as const;

/** Amount reserved by requests that are not decided / finished yet. */
export async function pendingRefundAmount(db: PrismaClient, paymentId: string): Promise<number> {
  const agg = await db.refund.aggregate({ where: { paymentId, status: { in: [...PENDING_REFUND_STATUSES] } }, _sum: { amount: true } });
  return agg._sum.amount ?? 0;
}

export function refundDeadline(capturedAt: Date | null, refundWindowDays: number | undefined): Date | null {
  if (!capturedAt || refundWindowDays === undefined) return null;
  return new Date(capturedAt.getTime() + refundWindowDays * 86_400_000);
}

export async function createRefundRequest(
  db: PrismaClient,
  opts: { input: RefundRequestInput; actor: RefundActor; audit: AuditContext; now?: Date },
) {
  const { input, actor } = opts;
  const now = opts.now ?? new Date();
  const payment = await db.payment.findUnique({
    where: { id: input.paymentId },
    select: { id: true, status: true, amount: true, amountRefunded: true, capturedAt: true, merchantId: true, livemode: true, merchant: { select: { refundWindowDays: true } } },
  });
  if (!payment) throw new ApiError(404, "not_found", "errors.notFound");
  if (payment.status !== "captured" && payment.status !== "partially_refunded") {
    throw new ApiError(409, "invalid_transition", "errors.refundOnlyCaptured");
  }
  if (input.reasonCode === "other" && !input.reason) {
    throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: { reason: "required" } });
  }
  const pending = await pendingRefundAmount(db, payment.id);
  const available = payment.amount - payment.amountRefunded - pending;
  if (input.amount > available) {
    throw new ApiError(400, "refund_exceeds", "errors.refundExceeds", { remaining: available });
  }
  const deadline = refundDeadline(payment.capturedAt, payment.merchant?.refundWindowDays);
  let forced = false;
  if (deadline && deadline.getTime() < now.getTime()) {
    if (actor.role !== "master" || !input.force) {
      throw new ApiError(409, "refund_window_expired", "errors.refundWindowExpired");
    }
    if (!input.reason) {
      throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: { reason: "required" } });
    }
    forced = true;
  }
  const kind = input.amount >= payment.amount ? "full" : "partial";
  return db.$transaction(async (tx) => {
    const row = await tx.refund.create({
      data: {
        paymentId: payment.id,
        merchantId: payment.merchantId,
        livemode: payment.livemode,
        amount: input.amount,
        kind,
        reasonCode: input.reasonCode,
        reason: input.reason || null,
        status: "requested",
        forced,
        requestedById: actor.id,
      },
      select: REFUND_SELECT,
    });
    await recordAudit(tx, opts.audit, {
      action: "refund.request",
      targetType: "refund",
      targetId: row.id,
      after: { paymentId: payment.id, amount: input.amount, kind, reasonCode: input.reasonCode, reason: input.reason || null, forced },
    });
    return row;
  });
}

export async function approveRefund(db: PrismaClient, opts: { refundId: string; actor: RefundActor; note: string; audit: AuditContext }) {
  const row = await db.refund.findUnique({ where: { id: opts.refundId }, select: { id: true, paymentId: true, amount: true, status: true, reason: true } });
  if (!row) throw new ApiError(404, "not_found", "errors.notFound");
  if (row.status !== "requested") throw new ApiError(409, "refund_not_pending", "errors.refundNotPending");
  // The state machine validates the balance again and writes payment.refund.
  await applyPaymentAction(db, {
    paymentId: row.paymentId,
    action: "refund",
    amount: row.amount,
    reason: row.reason,
    refund: { id: row.id, approvedById: opts.actor.id },
    actor: "dashboard",
    audit: opts.audit,
  });
  const updated = await db.refund.update({ where: { id: row.id }, data: { decisionNote: opts.note || null }, select: REFUND_SELECT });
  await recordAudit(db, opts.audit, {
    action: "refund.approve",
    targetType: "refund",
    targetId: row.id,
    before: { status: "requested" },
    after: { status: updated.status, amount: row.amount, note: opts.note || null },
  });
  return updated;
}

export async function rejectRefund(db: PrismaClient, opts: { refundId: string; actor: RefundActor; note: string; audit: AuditContext }) {
  const row = await db.refund.findUnique({ where: { id: opts.refundId }, select: { id: true, status: true, amount: true } });
  if (!row) throw new ApiError(404, "not_found", "errors.notFound");
  if (row.status !== "requested") throw new ApiError(409, "refund_not_pending", "errors.refundNotPending");
  return db.$transaction(async (tx) => {
    const updated = await tx.refund.update({
      where: { id: row.id },
      data: { status: "rejected", approvedById: opts.actor.id, decisionNote: opts.note || null, completedAt: new Date() },
      select: REFUND_SELECT,
    });
    await recordAudit(tx, opts.audit, {
      action: "refund.reject",
      targetType: "refund",
      targetId: row.id,
      before: { status: "requested" },
      after: { status: "rejected", amount: row.amount, note: opts.note || null },
    });
    return updated;
  });
}
