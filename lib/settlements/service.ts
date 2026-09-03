// Settlement batch generation and status transitions (Phase D).
//
// generateBatch aggregates the merchant's completed payments (fee per the
// contract in force at completion), completed refunds and lost chargebacks
// of a period into one batch with lines. Transitions follow
// SETTLEMENT_TRANSITIONS and are status-conditioned updates, like payments.

import type { PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/api/handler";
import { emitNotification } from "@/lib/notifications/emit";
import { recordAudit, type AuditContext } from "@/lib/audit";
import { isUniqueViolation } from "@/lib/ids";
import { calculateFee, currentScheduleIndex, isFeeMethod, parseFeeRates } from "@/lib/merchants/fees";
import { nextDayInTz, parseDateInTz } from "@/lib/time";
import { payoutDate } from "./schedule";
import { defaultTaxCategory } from "./tax";
import { SETTLEMENT_TRANSITIONS, isPayoutTerm, type SettlementAction, type TaxCategory } from "./types";

export const BATCH_SELECT = {
  id: true,
  merchantId: true,
  livemode: true,
  periodFrom: true,
  periodTo: true,
  grossAmount: true,
  feeAmount: true,
  refundAmount: true,
  chargebackAmount: true,
  settlementFee: true,
  netAmount: true,
  status: true,
  scheduledAt: true,
  paidAt: true,
  holdReason: true,
  createdAt: true,
  updatedAt: true,
  merchant: { select: { id: true, merchantCode: true, siteName: true, payoutTerm: true } },
  _count: { select: { lines: true } },
} as const;

export interface LineDraft {
  kind: "payment" | "refund" | "chargeback";
  paymentId?: string;
  refundId?: string;
  chargebackId?: string;
  method: string | null;
  description: string | null;
  amount: number;
  fee: number;
  occurredAt: Date;
  /** Tax category of the fee (Phase K-3); defaults per kind when omitted. */
  taxCategory?: TaxCategory;
}

/** Pure aggregation used by generateBatch and tests. */
export function summarize(lines: readonly LineDraft[], settlementFee: number) {
  let grossAmount = 0;
  let feeAmount = 0;
  let refundAmount = 0;
  let chargebackAmount = 0;
  for (const l of lines) {
    if (l.kind === "payment") {
      grossAmount += l.amount;
      feeAmount += l.fee;
    } else if (l.kind === "refund") refundAmount += -l.amount;
    else chargebackAmount += -l.amount;
  }
  const netAmount = grossAmount - feeAmount - refundAmount - chargebackAmount - settlementFee;
  return { grossAmount, feeAmount, refundAmount, chargebackAmount, settlementFee, netAmount };
}

export async function collectLines(db: PrismaClient, opts: { merchantId: string; livemode: boolean; from: Date; to: Date }): Promise<LineDraft[]> {
  const { merchantId, livemode, from, to } = opts;
  const [schedules, payments, refunds, chargebacks] = await Promise.all([
    db.merchantFeeSchedule.findMany({ where: { merchantId }, orderBy: { effectiveFrom: "desc" }, select: { effectiveFrom: true, rates: true } }),
    db.payment.findMany({
      where: { merchantId, livemode, status: { in: ["captured", "partially_refunded", "refunded", "chargeback"] }, capturedAt: { gte: from, lt: to } },
      select: { id: true, amount: true, method: true, orderNumber: true, capturedAt: true },
      orderBy: { capturedAt: "asc" },
    }),
    db.refund.findMany({
      where: { merchantId, livemode, status: "completed", completedAt: { gte: from, lt: to } },
      select: { id: true, amount: true, paymentId: true, completedAt: true, payment: { select: { method: true, orderNumber: true } } },
      orderBy: { completedAt: "asc" },
    }),
    db.chargeback.findMany({
      where: { merchantId, livemode, status: { in: ["lost", "confirmed"] }, resolvedAt: { gte: from, lt: to } },
      select: { id: true, amount: true, paymentId: true, resolvedAt: true, payment: { select: { method: true, orderNumber: true } } },
      orderBy: { resolvedAt: "asc" },
    }),
  ]);
  const lines: LineDraft[] = [];
  for (const p of payments) {
    const at = p.capturedAt ?? from;
    const idx = currentScheduleIndex(schedules, at);
    const rates = idx >= 0 ? parseFeeRates(schedules[idx].rates) : null;
    const fee = rates && isFeeMethod(p.method) ? calculateFee(rates, p.method, p.amount) : 0;
    lines.push({ kind: "payment", paymentId: p.id, method: p.method, description: p.orderNumber, amount: p.amount, fee, occurredAt: at, taxCategory: defaultTaxCategory("payment") });
  }
  for (const r of refunds) {
    lines.push({ kind: "refund", paymentId: r.paymentId, refundId: r.id, method: r.payment.method, description: r.payment.orderNumber, amount: -r.amount, fee: 0, occurredAt: r.completedAt ?? from, taxCategory: defaultTaxCategory("refund") });
  }
  for (const c of chargebacks) {
    lines.push({ kind: "chargeback", paymentId: c.paymentId, chargebackId: c.id, method: c.payment.method, description: c.payment.orderNumber, amount: -c.amount, fee: 0, occurredAt: c.resolvedAt ?? from, taxCategory: defaultTaxCategory("chargeback") });
  }
  lines.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  return lines;
}

export async function generateBatch(
  db: PrismaClient,
  opts: { merchantId: string; from: string; to: string; livemode: boolean; actorId: string | null; audit: AuditContext },
) {
  const from = parseDateInTz(opts.from);
  const toDay = parseDateInTz(opts.to);
  if (!from || !toDay || toDay.getTime() < from.getTime()) {
    throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: { to: "range" } });
  }
  const to = nextDayInTz(toDay);
  const merchant = await db.merchant.findUnique({ where: { id: opts.merchantId }, select: { id: true, settlementFee: true, payoutTerm: true } });
  if (!merchant) throw new ApiError(404, "not_found", "errors.notFound");
  const lines = await collectLines(db, { merchantId: merchant.id, livemode: opts.livemode, from, to });
  const totals = summarize(lines, merchant.settlementFee);
  const scheduledAt = payoutDate(toDay, isPayoutTerm(merchant.payoutTerm) ? merchant.payoutTerm : "next_month_end");
  try {
    return await db.$transaction(async (tx) => {
      const batch = await tx.settlementBatch.create({
        data: {
          merchantId: merchant.id,
          livemode: opts.livemode,
          periodFrom: from,
          periodTo: to,
          ...totals,
          status: "collecting",
          scheduledAt,
          createdById: opts.actorId,
          lines: { create: lines },
        },
        select: BATCH_SELECT,
      });
      await recordAudit(tx, opts.audit, {
        action: "settlement.generate",
        targetType: "settlement",
        targetId: batch.id,
        after: { merchantId: merchant.id, livemode: opts.livemode, from: opts.from, to: opts.to, lines: lines.length, ...totals },
      });
      await emitNotification(tx, { kind: "settlement.generated", title: `Settlement batch generated: ${opts.from} – ${opts.to}`, body: `Net payout ¥${totals.netAmount.toLocaleString("en-US")} over ${lines.length} lines. Review and confirm it.`, href: `/settlements/${batch.id}`, roles: ["admin", "accounting"], targetType: "settlement", targetId: batch.id });
      return batch;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new ApiError(409, "settlement_exists", "errors.settlementExists");
    throw e;
  }
}

export async function transitionBatch(
  db: PrismaClient,
  opts: { batchId: string; action: SettlementAction; reason?: string; audit: AuditContext; now?: Date },
) {
  const now = opts.now ?? new Date();
  const t = SETTLEMENT_TRANSITIONS[opts.action];
  const batch = await db.settlementBatch.findUnique({ where: { id: opts.batchId }, select: { id: true, status: true, scheduledAt: true, holdReason: true } });
  if (!batch) throw new ApiError(404, "not_found", "errors.notFound");
  if (!t.from.includes(batch.status as never)) throw new ApiError(409, "invalid_transition", "errors.settlementTransition");
  if (opts.action === "hold" && !opts.reason) {
    throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: { reason: "required" } });
  }
  const data = {
    status: t.to,
    ...(opts.action === "pay" ? { paidAt: now } : {}),
    ...(opts.action === "schedule" && !batch.scheduledAt ? { scheduledAt: now } : {}),
    ...(opts.action === "hold" ? { holdReason: opts.reason } : {}),
    ...(opts.action === "release" ? { holdReason: null } : {}),
  };
  return db.$transaction(async (tx) => {
    const updated = await tx.settlementBatch.updateMany({ where: { id: batch.id, status: { in: [...t.from] } }, data });
    if (updated.count === 0) throw new ApiError(409, "invalid_transition", "errors.settlementTransition");
    await recordAudit(tx, opts.audit, {
      action: `settlement.${opts.action}`,
      targetType: "settlement",
      targetId: batch.id,
      before: { status: batch.status, holdReason: batch.holdReason },
      after: { status: t.to, holdReason: opts.action === "hold" ? opts.reason : null },
    });
    if (opts.action === "hold") {
      await emitNotification(tx, { kind: "settlement.held", title: "Settlement batch put on hold", body: opts.reason ?? "", href: `/settlements/${batch.id}`, roles: ["admin", "accounting"], targetType: "settlement", targetId: batch.id, now });
    }
    return tx.settlementBatch.findUniqueOrThrow({ where: { id: batch.id }, select: BATCH_SELECT });
  });
}

/** A batch that has not been confirmed can be discarded and regenerated. */
export async function deleteBatch(db: PrismaClient, opts: { batchId: string; audit: AuditContext }) {
  const batch = await db.settlementBatch.findUnique({ where: { id: opts.batchId }, select: { id: true, status: true, merchantId: true, periodFrom: true, periodTo: true } });
  if (!batch) throw new ApiError(404, "not_found", "errors.notFound");
  if (batch.status !== "collecting") throw new ApiError(409, "invalid_transition", "errors.settlementTransition");
  await db.$transaction(async (tx) => {
    await tx.settlementBatch.delete({ where: { id: batch.id } });
    await recordAudit(tx, opts.audit, { action: "settlement.delete", targetType: "settlement", targetId: batch.id, before: batch });
  });
}
