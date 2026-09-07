// Short / excess deposits (過不足入金, Phase F-3): the follow-up state kept on
// the payment and the operator actions that move it.
//   open → (excess) refund_arranged: a refund request for the excess is filed
//   open → (short)  notified:        the customer was asked for the balance
//   any  → resolved

import type { PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/api/handler";
import { recordAudit, type AuditContext } from "@/lib/audit";
import { prisma } from "@/lib/db";
import type { DataMode } from "@/lib/mode";
import { isDepositDiffStatus, type DepositDiffAction, type DepositDiffFilters, type DepositDiffRow, type DepositDiffStatus } from "./deposit-diff-types";
import { parseSort, type QueryParams, type SortState } from "@/lib/query";
import { createRefundRequest, type RefundActor } from "@/lib/refunds/service";
import { isDepositDiff } from "@/lib/payments/transfer";

export { DEPOSIT_DIFF_STATUSES, DEPOSIT_DIFF_ACTIONS, isDepositDiffStatus, isDepositDiffAction, type DepositDiffStatus, type DepositDiffAction, type DepositDiffFilters, type DepositDiffRow } from "./deposit-diff-types";

export const DEPOSIT_DIFF_SORT_KEYS = ["updatedAt", "amount", "depositDiffStatus"] as const;

export function parseDepositDiffFilters(q: QueryParams | undefined, mode: DataMode): DepositDiffFilters {
  return {
    status: isDepositDiffStatus(q?.status) ? q!.status! : "",
    diff: isDepositDiff(q?.diff) ? q!.diff! : "",
    merchant: (q?.merchant ?? "").trim().slice(0, 64),
    mode,
  };
}

export function parseDepositDiffSort(q: QueryParams | undefined): SortState {
  return parseSort(q, DEPOSIT_DIFF_SORT_KEYS, { key: "updatedAt", dir: "desc" });
}

const SELECT = {
  id: true,
  orderNumber: true,
  merchant: { select: { id: true, merchantCode: true, siteName: true } },
  transferId: true,
  amount: true,
  depositAmount: true,
  depositDiff: true,
  depositDiffStatus: true,
  status: true,
  customerEmail: true,
  livemode: true,
  capturedAt: true,
  updatedAt: true,
  method: true,
  refunds: { where: { reasonCode: "duplicate" }, orderBy: { createdAt: "desc" as const }, take: 1, select: { id: true, status: true } },
} as const;

function whereFor(f: DepositDiffFilters) {
  return {
    livemode: f.mode === "live",
    depositDiff: f.diff ? f.diff : { in: ["short", "excess"] },
    ...(f.status ? { depositDiffStatus: f.status } : {}),
    ...(f.merchant ? { merchantId: f.merchant } : {}),
  };
}

type Raw = {
  id: string;
  orderNumber: string;
  merchant: { id: string; merchantCode: string; siteName: string } | null;
  transferId: string | null;
  amount: number;
  depositAmount: number | null;
  depositDiff: string | null;
  depositDiffStatus: string | null;
  status: string;
  customerEmail: string | null;
  livemode: boolean;
  capturedAt: Date | null;
  updatedAt: Date;
  method: string | null;
  refunds: Array<{ id: string; status: string }>;
};

/** Newest deposit_short e-mail per transaction (EmailLog has no relation to Payment). */
async function latestTopUpEmails(paymentIds: string[]): Promise<Map<string, { id: string; createdAt: Date }>> {
  if (paymentIds.length === 0) return new Map();
  const logs = await prisma.emailLog.findMany({ where: { paymentId: { in: paymentIds }, templateKey: "deposit_short" }, orderBy: { createdAt: "desc" }, select: { id: true, paymentId: true, createdAt: true } });
  const map = new Map<string, { id: string; createdAt: Date }>();
  for (const l of logs) if (l.paymentId && !map.has(l.paymentId)) map.set(l.paymentId, { id: l.id, createdAt: l.createdAt });
  return map;
}

function toRow(r: Raw, emailLog: { id: string; createdAt: Date } | null = null): DepositDiffRow {
  const deposited = r.depositAmount ?? 0;
  return {
    id: r.id,
    refund: r.refunds[0] ?? null,
    emailLog,
    orderNumber: r.orderNumber,
    merchant: r.merchant,
    transferId: r.transferId,
    amount: r.amount,
    depositAmount: deposited,
    difference: deposited - r.amount,
    diff: isDepositDiff(r.depositDiff) ? r.depositDiff : "short",
    diffStatus: isDepositDiffStatus(r.depositDiffStatus) ? r.depositDiffStatus : "open",
    paymentStatus: r.status,
    customerEmail: r.customerEmail,
    livemode: r.livemode,
    capturedAt: r.capturedAt,
    updatedAt: r.updatedAt,
  };
}

export async function loadDepositDiffs(opts: { filters: DepositDiffFilters; sort: SortState; page: number; pageSize: number }) {
  const where = whereFor(opts.filters);
  const [rows, total, merchants, openCount] = await Promise.all([
    prisma.payment.findMany({ where, orderBy: [{ [opts.sort.key]: opts.sort.dir }], skip: (opts.page - 1) * opts.pageSize, take: opts.pageSize, select: SELECT }),
    prisma.payment.count({ where }),
    prisma.merchant.findMany({ orderBy: { merchantCode: "asc" }, select: { id: true, merchantCode: true, siteName: true } }),
    prisma.payment.count({ where: { livemode: opts.filters.mode === "live", depositDiff: { in: ["short", "excess"] }, depositDiffStatus: "open" } }),
  ]);
  const emails = await latestTopUpEmails(rows.map((r) => r.id));
  return { rows: rows.map((r) => toRow(r, emails.get(r.id) ?? null)), total, merchants, openCount };
}

export async function loadDepositDiffsForExport(filters: DepositDiffFilters, sort: SortState, max: number): Promise<DepositDiffRow[]> {
  const rows = await prisma.payment.findMany({ where: whereFor(filters), orderBy: [{ [sort.key]: sort.dir }], take: max, select: SELECT });
  const emails = await latestTopUpEmails(rows.map((r) => r.id));
  return rows.map((r) => toRow(r, emails.get(r.id) ?? null));
}

/** Operator follow-up on a short / excess deposit. */
export async function applyDepositDiffAction(
  db: PrismaClient,
  opts: { paymentId: string; action: DepositDiffAction; actor: RefundActor; audit: AuditContext; onNotify?: (row: DepositDiffRow) => Promise<void> },
): Promise<DepositDiffRow> {
  const raw = await db.payment.findUnique({ where: { id: opts.paymentId }, select: SELECT });
  if (!raw || !isDepositDiff(raw.depositDiff)) throw new ApiError(404, "not_found", "errors.notFound");
  const row = toRow(raw);
  let next: DepositDiffStatus;
  if (opts.action === "refund") {
    if (row.diff !== "excess" || row.diffStatus !== "open") throw new ApiError(409, "invalid_transition", "errors.depositDiffTransition");
    await createRefundRequest(db, {
      input: { paymentId: row.id, amount: row.difference, reasonCode: "duplicate", reason: `excess deposit (${row.transferId ?? ""})`, force: false },
      actor: opts.actor,
      audit: opts.audit,
    });
    next = "refund_arranged";
  } else if (opts.action === "notify") {
    if (row.diff !== "short" || row.diffStatus !== "open") throw new ApiError(409, "invalid_transition", "errors.depositDiffTransition");
    if (opts.onNotify) await opts.onNotify(row);
    next = "notified";
  } else {
    if (row.diffStatus === "resolved") throw new ApiError(409, "invalid_transition", "errors.depositDiffTransition");
    next = "resolved";
  }
  await db.$transaction(async (tx) => {
    await tx.payment.update({ where: { id: row.id }, data: { depositDiffStatus: next } });
    await recordAudit(tx, opts.audit, { action: "payment.deposit_diff_update", targetType: "payment", targetId: row.id, before: { depositDiffStatus: row.diffStatus }, after: { depositDiffStatus: next, action: opts.action, difference: row.difference } });
  });
  return { ...row, diffStatus: next };
}
