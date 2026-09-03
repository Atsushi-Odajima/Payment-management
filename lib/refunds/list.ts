// Loader for the refund management screen (返金管理) and its CSV export.
// Requested rows come first so the master sees what needs a decision.

import { prisma } from "@/lib/db";
import type { DataMode } from "@/lib/mode";
import { parseSort, type QueryParams, type SortState } from "@/lib/query";
import { nextDayInTz, parseDateInTz } from "@/lib/time";
import { REFUND_SELECT } from "./service";
import { isRefundKind, isRefundReason, isRefundStatus, type RefundKind, type RefundReason, type RefundStatus } from "./types";

export interface RefundFilters {
  status: RefundStatus | "";
  merchant: string;
  from: string;
  to: string;
  mode: DataMode;
}

export interface AdminRef {
  id: string;
  loginId: string;
  name: string;
}

export interface RefundRow {
  id: string;
  paymentId: string;
  orderNumber: string;
  merchant: { id: string; merchantCode: string; siteName: string } | null;
  livemode: boolean;
  amount: number;
  paymentAmount: number;
  kind: RefundKind;
  reasonCode: RefundReason;
  reason: string | null;
  status: RefundStatus;
  forced: boolean;
  decisionNote: string | null;
  requestedBy: AdminRef | null;
  approvedBy: AdminRef | null;
  createdAt: Date;
  completedAt: Date | null;
}

export const REFUND_SORT_KEYS = ["createdAt", "amount", "status"] as const;

export function parseRefundFilters(q: QueryParams | undefined, mode: DataMode): RefundFilters {
  return {
    status: isRefundStatus(q?.status) ? q!.status! : "",
    merchant: (q?.merchant ?? "").trim().slice(0, 64),
    from: parseDateInTz(q?.from) ? q!.from!.trim() : "",
    to: parseDateInTz(q?.to) ? q!.to!.trim() : "",
    mode,
  };
}

export function parseRefundSort(q: QueryParams | undefined): SortState {
  return parseSort(q, REFUND_SORT_KEYS, { key: "createdAt", dir: "desc" });
}

function whereFor(f: RefundFilters) {
  const from = parseDateInTz(f.from);
  const to = parseDateInTz(f.to);
  return {
    livemode: f.mode === "live",
    ...(f.status ? { status: f.status } : {}),
    ...(f.merchant ? { merchantId: f.merchant } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: nextDayInTz(to) } : {}) } } : {}),
  };
}

const LIST_SELECT = {
  ...REFUND_SELECT,
  payment: { select: { orderNumber: true, amount: true, merchant: { select: { id: true, merchantCode: true, siteName: true } } } },
} as const;

type Raw = {
  id: string;
  paymentId: string;
  livemode: boolean;
  amount: number;
  kind: string;
  reasonCode: string;
  reason: string | null;
  status: string;
  forced: boolean;
  decisionNote: string | null;
  createdAt: Date;
  completedAt: Date | null;
  requestedBy: AdminRef | null;
  approvedBy: AdminRef | null;
  payment: { orderNumber: string; amount: number; merchant: { id: string; merchantCode: string; siteName: string } | null };
};

export function toRefundRow(r: Raw): RefundRow {
  return {
    id: r.id,
    paymentId: r.paymentId,
    orderNumber: r.payment.orderNumber,
    merchant: r.payment.merchant,
    livemode: r.livemode,
    amount: r.amount,
    paymentAmount: r.payment.amount,
    kind: isRefundKind(r.kind) ? r.kind : "partial",
    reasonCode: isRefundReason(r.reasonCode) ? r.reasonCode : "other",
    reason: r.reason,
    status: isRefundStatus(r.status) ? r.status : "completed",
    forced: r.forced,
    decisionNote: r.decisionNote,
    requestedBy: r.requestedBy,
    approvedBy: r.approvedBy,
    createdAt: r.createdAt,
    completedAt: r.completedAt,
  };
}

/** Default order: requested first (alphabetically last → desc), newest first. */
function orderFor(sort: SortState) {
  if (sort.key === "createdAt" && sort.dir === "desc") return [{ status: "desc" as const }, { createdAt: "desc" as const }];
  return [{ [sort.key]: sort.dir }, { createdAt: "desc" as const }];
}

export async function loadRefunds(opts: { filters: RefundFilters; sort: SortState; page: number; pageSize: number }) {
  const where = whereFor(opts.filters);
  const [rows, total, merchants, pendingCount] = await Promise.all([
    prisma.refund.findMany({ where, orderBy: orderFor(opts.sort), skip: (opts.page - 1) * opts.pageSize, take: opts.pageSize, select: LIST_SELECT }),
    prisma.refund.count({ where }),
    prisma.merchant.findMany({ orderBy: { merchantCode: "asc" }, select: { id: true, merchantCode: true, siteName: true } }),
    prisma.refund.count({ where: { livemode: opts.filters.mode === "live", status: "requested" } }),
  ]);
  return { rows: rows.map(toRefundRow), total, merchants, pendingCount };
}

export async function loadRefundsForExport(filters: RefundFilters, sort: SortState, max: number): Promise<RefundRow[]> {
  const rows = await prisma.refund.findMany({ where: whereFor(filters), orderBy: orderFor(sort), take: max, select: LIST_SELECT });
  return rows.map(toRefundRow);
}

export async function loadRefund(id: string): Promise<RefundRow | null> {
  const r = await prisma.refund.findUnique({ where: { id }, select: LIST_SELECT });
  return r ? toRefundRow(r) : null;
}
