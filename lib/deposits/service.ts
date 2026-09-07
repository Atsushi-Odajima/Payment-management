// Unmatched bank deposits (未消込入金) and the "API re-notify" (API 再通知)
// for bank transfers.
//
//   register  – a deposit arrived without a usable transfer id (from the bank
//               notification API or typed in by support)
//   match     – support attaches the transfer id: the deposit is reconciled
//               through the normal `deposit` action (exact → completed, short /
//               excess flags) and, when the transaction completes, the
//               merchant's notification URL receives payment.completed so the
//               customer is credited by API, not by hand
//   dismiss   – the deposit is handled outside the system (returned, duplicate)
//   renotify  – re-send payment.completed for a completed bank transfer whose
//               merchant missed / lost the first notification

import type { PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/api/handler";
import { recordAudit, type AuditContext } from "@/lib/audit";
import { applyPaymentAction, type ApplyActionResult } from "@/lib/payments/actions";
import { emitPaymentWebhook } from "@/lib/webhooks/deliver";
import type { DismissKind, TransferCandidate, UnmatchedDepositInput, UnmatchedDepositReason, UnmatchedDepositSource } from "./types";

export const UNMATCHED_DEPOSIT_SELECT = {
  id: true,
  livemode: true,
  amount: true,
  payerName: true,
  receivedAt: true,
  bankReference: true,
  givenTransferId: true,
  note: true,
  source: true,
  status: true,
  reason: true,
  candidatePayment: { select: { id: true, orderNumber: true, status: true, livemode: true, method: true, transferId: true, cvsReceiptNo: true, merchant: { select: { id: true, merchantCode: true, siteName: true } } } },
  matchedTransferId: true,
  matchedAt: true,
  dismissKind: true,
  dismissReason: true,
  createdAt: true,
  payment: { select: { id: true, orderNumber: true, status: true, merchant: { select: { id: true, merchantCode: true, siteName: true } } } },
} as const;

const RENOTIFY_STATUSES = ["captured", "partially_refunded", "refunded"] as const;

export async function registerUnmatchedDeposit(
  db: PrismaClient,
  opts: { input: UnmatchedDepositInput; livemode: boolean; source: UnmatchedDepositSource; reason?: UnmatchedDepositReason | null; candidatePaymentId?: string | null; audit: AuditContext; now?: Date },
) {
  const now = opts.now ?? new Date();
  const receivedAt = opts.input.receivedAt ? new Date(opts.input.receivedAt) : now;
  if (Number.isNaN(receivedAt.getTime())) throw new ApiError(400, "invalid_input", "errors.invalidInput", undefined, { fieldErrors: { receivedAt: "date" } });
  return db.$transaction(async (tx) => {
    const row = await tx.unmatchedDeposit.create({
      data: {
        livemode: opts.livemode,
        amount: opts.input.amount,
        payerName: opts.input.payerName,
        receivedAt,
        bankReference: opts.input.bankReference || null,
        givenTransferId: opts.input.givenTransferId || null,
        note: opts.input.note || null,
        source: opts.source,
        status: "unmatched",
        reason: opts.reason ?? null,
        candidatePaymentId: opts.candidatePaymentId ?? null,
        createdAt: now,
      },
      select: UNMATCHED_DEPOSIT_SELECT,
    });
    await recordAudit(tx, opts.audit, { action: "deposit.register", targetType: "unmatched_deposit", targetId: row.id, after: { amount: row.amount, payerName: row.payerName, receivedAt, givenTransferId: row.givenTransferId, source: opts.source, livemode: opts.livemode, reason: opts.reason ?? null, candidatePaymentId: opts.candidatePaymentId ?? null } });
    return row;
  });
}

/**
 * Awaiting bank transfers of the deposit's mode, exact-amount matches first,
 * then by deadline. The transaction the notification named (late / cancelled /
 * other-mode, Phase P1-2 / P1-3) is listed first with the flag that explains
 * why it cannot be selected the normal way.
 */
export async function findTransferCandidates(db: PrismaClient, deposit: { amount: number; livemode: boolean; candidatePaymentId?: string | null }, now: Date = new Date(), limit = 20): Promise<TransferCandidate[]> {
  const select = { id: true, transferId: true, cvsReceiptNo: true, orderNumber: true, amount: true, status: true, livemode: true, customerName: true, transferDueAt: true, depositAmount: true, merchant: { select: { merchantCode: true, siteName: true } } } as const;
  const [rows, linked] = await Promise.all([
    db.payment.findMany({
      where: { livemode: deposit.livemode, method: "bank", status: "awaiting_transfer", transferId: { not: null } },
      select,
      orderBy: [{ transferDueAt: "asc" }],
      take: 200,
    }),
    deposit.candidatePaymentId ? db.payment.findUnique({ where: { id: deposit.candidatePaymentId }, select }) : Promise.resolve(null),
  ]);
  const toCandidate = (p: (typeof rows)[number]): TransferCandidate => ({
    paymentId: p.id,
    transferId: p.transferId ?? p.cvsReceiptNo ?? "",
    orderNumber: p.orderNumber,
    amount: p.amount,
    customerName: p.customerName,
    merchant: p.merchant,
    transferDueAt: p.transferDueAt,
    exact: p.amount - (p.depositAmount ?? 0) === deposit.amount,
    overdue: p.transferDueAt !== null && p.transferDueAt.getTime() < now.getTime(),
    status: p.status,
    livemode: p.livemode,
    modeMismatch: p.livemode !== deposit.livemode,
    late: p.status === "expired",
  });
  const list = rows
    .filter((p) => p.id !== linked?.id)
    .map(toCandidate)
    .sort((a, b) => Number(b.exact) - Number(a.exact) || (a.transferDueAt?.getTime() ?? 0) - (b.transferDueAt?.getTime() ?? 0))
    .slice(0, limit);
  return linked ? [toCandidate(linked), ...list] : list;
}

export interface MatchResult {
  deposit: Awaited<ReturnType<typeof registerUnmatchedDeposit>>;
  payment: ApplyActionResult;
  /** Delivery id of the payment.completed notification, when the transaction completed and the merchant has a notify URL. */
  renotified: boolean;
}

/** Attach a transfer id to an unmatched deposit: reconcile the transaction and notify the merchant. */
export async function matchUnmatchedDeposit(db: PrismaClient, opts: { id: string; transferId: string; actorId: string | null; audit: AuditContext; now?: Date }): Promise<MatchResult> {
  const now = opts.now ?? new Date();
  const deposit = await db.unmatchedDeposit.findUnique({ where: { id: opts.id }, select: { id: true, status: true, amount: true, livemode: true } });
  if (!deposit) throw new ApiError(404, "not_found", "errors.notFound");
  if (deposit.status !== "unmatched") throw new ApiError(409, "deposit_not_open", "errors.depositAlreadyHandled");
  const payment = await db.payment.findUnique({ where: { transferId: opts.transferId }, select: { id: true, status: true, method: true, livemode: true, merchantId: true } });
  if (!payment || payment.method !== "bank") throw new ApiError(404, "transfer_not_found", "errors.transferNotFound");
  if (payment.livemode !== deposit.livemode) throw new ApiError(409, "mode_mismatch", "errors.depositModeMismatch");
  if (payment.status !== "awaiting_transfer") throw new ApiError(409, "invalid_transition", "errors.depositOnlyAwaiting");

  // The same reconciliation as the bank notification / the "Reconcile deposit" button.
  const result = await applyPaymentAction(db, { paymentId: payment.id, action: "deposit", amount: deposit.amount, actor: "dashboard", audit: opts.audit });
  const row = await db.$transaction(async (tx) => {
    const updated = await tx.unmatchedDeposit.updateMany({ where: { id: deposit.id, status: "unmatched" }, data: { status: "matched", paymentId: payment.id, matchedTransferId: opts.transferId, matchedById: opts.actorId, matchedAt: now } });
    if (updated.count === 0) throw new ApiError(409, "deposit_not_open", "errors.depositAlreadyHandled");
    await recordAudit(tx, opts.audit, { action: "deposit.match", targetType: "unmatched_deposit", targetId: deposit.id, before: { status: "unmatched" }, after: { status: "matched", paymentId: payment.id, transferId: opts.transferId, amount: deposit.amount, paymentStatus: result.status, depositDiff: result.depositDiff } });
    return tx.unmatchedDeposit.findUniqueOrThrow({ where: { id: deposit.id }, select: UNMATCHED_DEPOSIT_SELECT });
  });
  // applyPaymentAction already emitted payment.completed when the transaction completed.
  return { deposit: row, payment: result, renotified: result.status === "captured" && payment.merchantId !== null };
}

/**
 * Late deposit (Phase P1-3): the money arrived after the transaction expired.
 * Support applies it through the `late_deposit` transition (expired →
 * captured; a short / excess amount stays visible in depositDiff), which sends
 * payment.completed and the completion e-mail like any other completion.
 */
export async function lateMatchUnmatchedDeposit(db: PrismaClient, opts: { id: string; reason: string; actorId: string | null; audit: AuditContext; now?: Date }): Promise<MatchResult> {
  const now = opts.now ?? new Date();
  const deposit = await db.unmatchedDeposit.findUnique({ where: { id: opts.id }, select: { id: true, status: true, amount: true, livemode: true, reason: true, candidatePaymentId: true } });
  if (!deposit) throw new ApiError(404, "not_found", "errors.notFound");
  if (deposit.status !== "unmatched") throw new ApiError(409, "deposit_not_open", "errors.depositAlreadyHandled");
  if (!deposit.candidatePaymentId) throw new ApiError(409, "no_candidate", "errors.lateDepositNoCandidate");
  const payment = await db.payment.findUnique({ where: { id: deposit.candidatePaymentId }, select: { id: true, status: true, livemode: true, merchantId: true, transferId: true, cvsReceiptNo: true } });
  if (!payment) throw new ApiError(404, "not_found", "errors.notFound");
  if (payment.livemode !== deposit.livemode) throw new ApiError(409, "mode_mismatch", "errors.depositModeMismatch");
  if (payment.status !== "expired") throw new ApiError(409, "invalid_transition", "errors.lateDepositOnlyExpired");

  const result = await applyPaymentAction(db, { paymentId: payment.id, action: "late_deposit", amount: deposit.amount, actor: "dashboard", audit: opts.audit });
  const row = await db.$transaction(async (tx) => {
    const updated = await tx.unmatchedDeposit.updateMany({ where: { id: deposit.id, status: "unmatched" }, data: { status: "matched", paymentId: payment.id, matchedTransferId: payment.transferId ?? payment.cvsReceiptNo, matchedById: opts.actorId, matchedAt: now, note: opts.reason } });
    if (updated.count === 0) throw new ApiError(409, "deposit_not_open", "errors.depositAlreadyHandled");
    await recordAudit(tx, opts.audit, { action: "deposit.late_match", targetType: "unmatched_deposit", targetId: deposit.id, before: { status: "unmatched", reason: deposit.reason }, after: { status: "matched", paymentId: payment.id, amount: deposit.amount, reason: opts.reason, paymentStatus: result.status, depositDiff: result.depositDiff } });
    return tx.unmatchedDeposit.findUniqueOrThrow({ where: { id: deposit.id }, select: UNMATCHED_DEPOSIT_SELECT });
  });
  return { deposit: row, payment: result, renotified: result.status === "captured" && payment.merchantId !== null };
}

export async function dismissUnmatchedDeposit(db: PrismaClient, opts: { id: string; reason: string; kind?: DismissKind; audit: AuditContext }) {
  const deposit = await db.unmatchedDeposit.findUnique({ where: { id: opts.id }, select: { id: true, status: true } });
  if (!deposit) throw new ApiError(404, "not_found", "errors.notFound");
  if (deposit.status !== "unmatched") throw new ApiError(409, "deposit_not_open", "errors.depositAlreadyHandled");
  const kind: DismissKind = opts.kind ?? "other";
  return db.$transaction(async (tx) => {
    const updated = await tx.unmatchedDeposit.updateMany({ where: { id: deposit.id, status: "unmatched" }, data: { status: "dismissed", dismissKind: kind, dismissReason: opts.reason } });
    if (updated.count === 0) throw new ApiError(409, "deposit_not_open", "errors.depositAlreadyHandled");
    await recordAudit(tx, opts.audit, { action: "deposit.dismiss", targetType: "unmatched_deposit", targetId: deposit.id, before: { status: "unmatched" }, after: { status: "dismissed", kind, reason: opts.reason } });
    return tx.unmatchedDeposit.findUniqueOrThrow({ where: { id: deposit.id }, select: UNMATCHED_DEPOSIT_SELECT });
  });
}

/**
 * API re-notify: send payment.completed again for a completed
 * bank transfer. Bank transfers only — card / QR payments are confirmed by the
 * provider callback and need no support-side re-notification.
 */
export async function renotifyPayment(db: PrismaClient, opts: { paymentId: string; audit: AuditContext; now?: Date }): Promise<{ deliveryId: string | null; renotifyCount: number; renotifiedAt: Date }> {
  const now = opts.now ?? new Date();
  const payment = await db.payment.findUnique({ where: { id: opts.paymentId }, select: { id: true, method: true, status: true, merchantId: true, renotifyCount: true } });
  if (!payment) throw new ApiError(404, "not_found", "errors.notFound");
  if (payment.method !== "bank") throw new ApiError(409, "not_bank_transfer", "errors.notBankTransfer");
  if (!payment.merchantId) throw new ApiError(409, "no_merchant", "errors.renotifyNoMerchant");
  if (!(RENOTIFY_STATUSES as readonly string[]).includes(payment.status)) throw new ApiError(409, "invalid_transition", "errors.renotifyNotCompleted");
  const deliveryId = await emitPaymentWebhook(db, payment.id, "payment.completed");
  const renotifyCount = payment.renotifyCount + 1;
  await db.$transaction(async (tx) => {
    await tx.payment.update({ where: { id: payment.id }, data: { renotifiedAt: now, renotifyCount } });
    await recordAudit(tx, opts.audit, { action: "payment.renotify", targetType: "payment", targetId: payment.id, before: { renotifyCount: payment.renotifyCount }, after: { renotifyCount, deliveryId, event: "payment.completed" } });
  });
  return { deliveryId, renotifyCount, renotifiedAt: now };
}
