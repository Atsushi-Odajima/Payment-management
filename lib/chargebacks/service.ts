// Chargeback flow (Phase F-1): register (master) → dispute with evidence →
// resolve won / lost → confirm. Lost and confirmed chargebacks move the
// payment to the "chargeback" status through the state machine and are
// deducted by settlement batches (lib/settlements/service.ts).

import type { PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/api/handler";
import { recordAudit, type AuditContext } from "@/lib/audit";
import { applyPaymentAction } from "@/lib/payments/actions";
import { parseDateInTz } from "@/lib/time";
import { emitPaymentWebhook } from "@/lib/webhooks/deliver";
import { DISPUTE_DEADLINE_DAYS, type ChargebackCreateInput } from "./types";

export const CHARGEBACK_SELECT = {
  id: true,
  paymentId: true,
  merchantId: true,
  livemode: true,
  amount: true,
  reasonCode: true,
  status: true,
  disputeDeadlineAt: true,
  evidenceNote: true,
  occurredAt: true,
  resolvedAt: true,
  createdAt: true,
  updatedAt: true,
  payment: { select: { orderNumber: true, amount: true, status: true, merchant: { select: { id: true, merchantCode: true, siteName: true } } } },
} as const;

export async function createChargeback(db: PrismaClient, opts: { input: ChargebackCreateInput; audit: AuditContext; now?: Date }) {
  const now = opts.now ?? new Date();
  const payment = await db.payment.findUnique({ where: { id: opts.input.paymentId }, select: { id: true, amount: true, status: true, merchantId: true, livemode: true } });
  if (!payment) throw new ApiError(404, "not_found", "errors.notFound");
  if (!["captured", "partially_refunded", "refunded"].includes(payment.status)) {
    throw new ApiError(409, "invalid_transition", "errors.chargebackOnlyCaptured");
  }
  const open = await db.chargeback.count({ where: { paymentId: payment.id, status: { in: ["received", "disputed"] } } });
  if (open > 0) throw new ApiError(409, "chargeback_exists", "errors.chargebackExists");
  const amount = opts.input.amount ?? payment.amount;
  if (amount > payment.amount) throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: { amount: "range" } });
  const deadline = opts.input.disputeDeadline ? parseDateInTz(opts.input.disputeDeadline) : new Date(now.getTime() + DISPUTE_DEADLINE_DAYS * 86_400_000);
  const row = await db.$transaction(async (tx) => {
    const created = await tx.chargeback.create({
      data: {
        paymentId: payment.id,
        merchantId: payment.merchantId,
        livemode: payment.livemode,
        amount,
        reasonCode: opts.input.reasonCode,
        status: "received",
        disputeDeadlineAt: deadline,
        evidenceNote: opts.input.evidenceNote || null,
        occurredAt: now,
      },
      select: CHARGEBACK_SELECT,
    });
    await recordAudit(tx, opts.audit, {
      action: "chargeback.create",
      targetType: "chargeback",
      targetId: created.id,
      after: { paymentId: payment.id, amount, reasonCode: opts.input.reasonCode, disputeDeadlineAt: deadline },
    });
    return created;
  });
  await emitPaymentWebhook(db, payment.id, "chargeback.opened", { status: `chargeback:${opts.input.reasonCode}`, amount: String(amount) });
  return row;
}

export async function disputeChargeback(db: PrismaClient, opts: { id: string; evidenceNote: string; audit: AuditContext }) {
  const cb = await db.chargeback.findUnique({ where: { id: opts.id }, select: { id: true, status: true, evidenceNote: true } });
  if (!cb) throw new ApiError(404, "not_found", "errors.notFound");
  if (cb.status !== "received") throw new ApiError(409, "invalid_transition", "errors.chargebackTransition");
  return db.$transaction(async (tx) => {
    const updated = await tx.chargeback.updateMany({ where: { id: cb.id, status: "received" }, data: { status: "disputed", evidenceNote: opts.evidenceNote } });
    if (updated.count === 0) throw new ApiError(409, "invalid_transition", "errors.chargebackTransition");
    await recordAudit(tx, opts.audit, { action: "chargeback.dispute", targetType: "chargeback", targetId: cb.id, before: { status: "received", evidenceNote: cb.evidenceNote }, after: { status: "disputed", evidenceNote: opts.evidenceNote } });
    return tx.chargeback.findUniqueOrThrow({ where: { id: cb.id }, select: CHARGEBACK_SELECT });
  });
}

/** Record the outcome of a dispute. A loss moves the payment to "chargeback". */
export async function resolveChargeback(db: PrismaClient, opts: { id: string; outcome: "won" | "lost"; note: string; audit: AuditContext; now?: Date }) {
  const now = opts.now ?? new Date();
  const cb = await db.chargeback.findUnique({ where: { id: opts.id }, select: { id: true, status: true, paymentId: true, evidenceNote: true } });
  if (!cb) throw new ApiError(404, "not_found", "errors.notFound");
  if (cb.status !== "disputed") throw new ApiError(409, "invalid_transition", "errors.chargebackTransition");
  const evidenceNote = opts.note ? `${cb.evidenceNote ? cb.evidenceNote + "\n" : ""}${opts.note}` : cb.evidenceNote;
  await db.$transaction(async (tx) => {
    const updated = await tx.chargeback.updateMany({ where: { id: cb.id, status: "disputed" }, data: { status: opts.outcome, resolvedAt: now, evidenceNote } });
    if (updated.count === 0) throw new ApiError(409, "invalid_transition", "errors.chargebackTransition");
    await recordAudit(tx, opts.audit, { action: "chargeback.resolve", targetType: "chargeback", targetId: cb.id, before: { status: "disputed" }, after: { status: opts.outcome, note: opts.note || null } });
  });
  if (opts.outcome === "lost") await markPaymentChargeback(db, cb.paymentId, opts.audit);
  return db.chargeback.findUniqueOrThrow({ where: { id: cb.id }, select: CHARGEBACK_SELECT });
}

/** Accept the chargeback as final (no dispute, or after losing). */
export async function confirmChargeback(db: PrismaClient, opts: { id: string; audit: AuditContext; now?: Date }) {
  const now = opts.now ?? new Date();
  const cb = await db.chargeback.findUnique({ where: { id: opts.id }, select: { id: true, status: true, paymentId: true, resolvedAt: true } });
  if (!cb) throw new ApiError(404, "not_found", "errors.notFound");
  if (!["received", "disputed", "lost"].includes(cb.status)) throw new ApiError(409, "invalid_transition", "errors.chargebackTransition");
  await db.$transaction(async (tx) => {
    const updated = await tx.chargeback.updateMany({ where: { id: cb.id, status: { in: ["received", "disputed", "lost"] } }, data: { status: "confirmed", resolvedAt: cb.resolvedAt ?? now } });
    if (updated.count === 0) throw new ApiError(409, "invalid_transition", "errors.chargebackTransition");
    await recordAudit(tx, opts.audit, { action: "chargeback.confirm", targetType: "chargeback", targetId: cb.id, before: { status: cb.status }, after: { status: "confirmed" } });
  });
  await markPaymentChargeback(db, cb.paymentId, opts.audit);
  return db.chargeback.findUniqueOrThrow({ where: { id: cb.id }, select: CHARGEBACK_SELECT });
}

async function markPaymentChargeback(db: PrismaClient, paymentId: string, audit: AuditContext) {
  const p = await db.payment.findUnique({ where: { id: paymentId }, select: { status: true } });
  if (!p || p.status === "chargeback") return;
  await applyPaymentAction(db, { paymentId, action: "chargeback", actor: "dashboard", audit });
}
