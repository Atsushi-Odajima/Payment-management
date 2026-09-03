// Chargeback list / detail loaders: open cases ordered by dispute deadline.

import { prisma } from "@/lib/db";
import type { DataMode } from "@/lib/mode";
import { parseSort, type QueryParams, type SortState } from "@/lib/query";
import { nextDayInTz, parseDateInTz } from "@/lib/time";
import { CHARGEBACK_SELECT } from "./service";
import { isChargebackReason, isChargebackStatus, type ChargebackReason, type ChargebackStatus } from "./types";

export interface ChargebackFilters {
  status: ChargebackStatus | "";
  merchant: string;
  from: string;
  to: string;
  mode: DataMode;
}

export interface ChargebackRow {
  id: string;
  paymentId: string;
  orderNumber: string;
  paymentAmount: number;
  paymentStatus: string;
  merchant: { id: string; merchantCode: string; siteName: string } | null;
  livemode: boolean;
  amount: number;
  reasonCode: ChargebackReason;
  status: ChargebackStatus;
  disputeDeadlineAt: Date | null;
  evidenceNote: string | null;
  occurredAt: Date;
  resolvedAt: Date | null;
  createdAt: Date;
}

export const CHARGEBACK_SORT_KEYS = ["disputeDeadlineAt", "occurredAt", "amount", "status"] as const;

export function parseChargebackFilters(q: QueryParams | undefined, mode: DataMode): ChargebackFilters {
  return {
    status: isChargebackStatus(q?.status) ? q!.status! : "",
    merchant: (q?.merchant ?? "").trim().slice(0, 64),
    from: parseDateInTz(q?.from) ? q!.from!.trim() : "",
    to: parseDateInTz(q?.to) ? q!.to!.trim() : "",
    mode,
  };
}

export function parseChargebackSort(q: QueryParams | undefined): SortState {
  return parseSort(q, CHARGEBACK_SORT_KEYS, { key: "disputeDeadlineAt", dir: "asc" });
}

function whereFor(f: ChargebackFilters) {
  const from = parseDateInTz(f.from);
  const to = parseDateInTz(f.to);
  return {
    livemode: f.mode === "live",
    ...(f.status ? { status: f.status } : {}),
    ...(f.merchant ? { merchantId: f.merchant } : {}),
    ...(from || to ? { occurredAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: nextDayInTz(to) } : {}) } } : {}),
  };
}

type Raw = {
  id: string;
  paymentId: string;
  livemode: boolean;
  amount: number;
  reasonCode: string;
  status: string;
  disputeDeadlineAt: Date | null;
  evidenceNote: string | null;
  occurredAt: Date;
  resolvedAt: Date | null;
  createdAt: Date;
  payment: { orderNumber: string; amount: number; status: string; merchant: { id: string; merchantCode: string; siteName: string } | null };
};

export function toChargebackRow(r: Raw): ChargebackRow {
  return {
    id: r.id,
    paymentId: r.paymentId,
    orderNumber: r.payment.orderNumber,
    paymentAmount: r.payment.amount,
    paymentStatus: r.payment.status,
    merchant: r.payment.merchant,
    livemode: r.livemode,
    amount: r.amount,
    reasonCode: isChargebackReason(r.reasonCode) ? r.reasonCode : "other",
    status: isChargebackStatus(r.status) ? r.status : "received",
    disputeDeadlineAt: r.disputeDeadlineAt,
    evidenceNote: r.evidenceNote,
    occurredAt: r.occurredAt,
    resolvedAt: r.resolvedAt,
    createdAt: r.createdAt,
  };
}

const OPEN_RANK: Record<ChargebackStatus, number> = { received: 0, disputed: 1, lost: 2, won: 3, confirmed: 4 };

export async function loadChargebacks(opts: { filters: ChargebackFilters; sort: SortState; page: number; pageSize: number }) {
  const where = whereFor(opts.filters);
  const defaultOrder = opts.sort.key === "disputeDeadlineAt" && opts.sort.dir === "asc";
  const [raw, total, merchants, openCount] = await Promise.all([
    defaultOrder
      ? prisma.chargeback.findMany({ where, orderBy: { disputeDeadlineAt: "asc" }, take: 500, select: CHARGEBACK_SELECT })
      : prisma.chargeback.findMany({ where, orderBy: [{ [opts.sort.key]: opts.sort.dir }, { createdAt: "desc" }], skip: (opts.page - 1) * opts.pageSize, take: opts.pageSize, select: CHARGEBACK_SELECT }),
    prisma.chargeback.count({ where }),
    prisma.merchant.findMany({ orderBy: { merchantCode: "asc" }, select: { id: true, merchantCode: true, siteName: true } }),
    prisma.chargeback.count({ where: { livemode: opts.filters.mode === "live", status: { in: ["received", "disputed"] } } }),
  ]);
  let rows = raw.map(toChargebackRow);
  if (defaultOrder) {
    // Open cases first, nearest deadline first.
    rows.sort((a, b) => OPEN_RANK[a.status] - OPEN_RANK[b.status] || (a.disputeDeadlineAt?.getTime() ?? Infinity) - (b.disputeDeadlineAt?.getTime() ?? Infinity));
    rows = rows.slice((opts.page - 1) * opts.pageSize, opts.page * opts.pageSize);
  }
  return { rows, total, merchants, openCount };
}

export async function loadChargebacksForExport(filters: ChargebackFilters, sort: SortState, max: number): Promise<ChargebackRow[]> {
  const rows = await prisma.chargeback.findMany({ where: whereFor(filters), orderBy: [{ [sort.key]: sort.dir }], take: max, select: CHARGEBACK_SELECT });
  return rows.map(toChargebackRow);
}

export async function loadChargeback(id: string): Promise<ChargebackRow | null> {
  const r = await prisma.chargeback.findUnique({ where: { id }, select: CHARGEBACK_SELECT });
  return r ? toChargebackRow(r) : null;
}
