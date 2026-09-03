// Loaders for the settlement screens (list, detail with lines, merchant tab).

import { prisma } from "@/lib/db";
import type { DataMode } from "@/lib/mode";
import { parseSort, type QueryParams, type SortState } from "@/lib/query";
import { nextDayInTz, parseDateInTz } from "@/lib/time";
import { BATCH_SELECT } from "./service";
import { isLineKind, isSettlementStatus, type LineKind, type SettlementStatus } from "./types";

export interface SettlementFilters {
  status: SettlementStatus | "";
  merchant: string;
  from: string;
  to: string;
  mode: DataMode;
}

export interface SettlementRow {
  id: string;
  merchant: { id: string; merchantCode: string; siteName: string };
  livemode: boolean;
  periodFrom: Date;
  /** Exclusive. */
  periodTo: Date;
  grossAmount: number;
  feeAmount: number;
  refundAmount: number;
  chargebackAmount: number;
  settlementFee: number;
  netAmount: number;
  status: SettlementStatus;
  scheduledAt: Date | null;
  paidAt: Date | null;
  holdReason: string | null;
  lineCount: number;
  createdAt: Date;
}

export interface SettlementLineRow {
  id: string;
  kind: LineKind;
  paymentId: string | null;
  refundId: string | null;
  chargebackId: string | null;
  method: string | null;
  description: string | null;
  amount: number;
  fee: number;
  occurredAt: Date;
}

export const SETTLEMENT_SORT_KEYS = ["periodFrom", "netAmount", "status", "scheduledAt"] as const;

export function parseSettlementFilters(q: QueryParams | undefined, mode: DataMode): SettlementFilters {
  return {
    status: isSettlementStatus(q?.status) ? q!.status! : "",
    merchant: (q?.merchant ?? "").trim().slice(0, 64),
    from: parseDateInTz(q?.from) ? q!.from!.trim() : "",
    to: parseDateInTz(q?.to) ? q!.to!.trim() : "",
    mode,
  };
}

export function parseSettlementSort(q: QueryParams | undefined): SortState {
  return parseSort(q, SETTLEMENT_SORT_KEYS, { key: "periodFrom", dir: "desc" });
}

function whereFor(f: SettlementFilters) {
  const from = parseDateInTz(f.from);
  const to = parseDateInTz(f.to);
  return {
    livemode: f.mode === "live",
    ...(f.status ? { status: f.status } : {}),
    ...(f.merchant ? { merchantId: f.merchant } : {}),
    ...(from ? { periodTo: { gt: from } } : {}),
    ...(to ? { periodFrom: { lt: nextDayInTz(to) } } : {}),
  };
}

type Raw = {
  id: string;
  livemode: boolean;
  periodFrom: Date;
  periodTo: Date;
  grossAmount: number;
  feeAmount: number;
  refundAmount: number;
  chargebackAmount: number;
  settlementFee: number;
  netAmount: number;
  status: string;
  scheduledAt: Date | null;
  paidAt: Date | null;
  holdReason: string | null;
  createdAt: Date;
  merchant: { id: string; merchantCode: string; siteName: string };
  _count: { lines: number };
};

export function toSettlementRow(r: Raw): SettlementRow {
  return {
    id: r.id,
    merchant: r.merchant,
    livemode: r.livemode,
    periodFrom: r.periodFrom,
    periodTo: r.periodTo,
    grossAmount: r.grossAmount,
    feeAmount: r.feeAmount,
    refundAmount: r.refundAmount,
    chargebackAmount: r.chargebackAmount,
    settlementFee: r.settlementFee,
    netAmount: r.netAmount,
    status: isSettlementStatus(r.status) ? r.status : "collecting",
    scheduledAt: r.scheduledAt,
    paidAt: r.paidAt,
    holdReason: r.holdReason,
    lineCount: r._count.lines,
    createdAt: r.createdAt,
  };
}

export async function loadSettlements(opts: { filters: SettlementFilters; sort: SortState; page: number; pageSize: number }) {
  const where = whereFor(opts.filters);
  const [rows, total, merchants] = await Promise.all([
    prisma.settlementBatch.findMany({ where, orderBy: [{ [opts.sort.key]: opts.sort.dir }, { createdAt: "desc" }], skip: (opts.page - 1) * opts.pageSize, take: opts.pageSize, select: BATCH_SELECT }),
    prisma.settlementBatch.count({ where }),
    prisma.merchant.findMany({ orderBy: { merchantCode: "asc" }, select: { id: true, merchantCode: true, siteName: true, settlementCycle: true } }),
  ]);
  return { rows: rows.map(toSettlementRow), total, merchants };
}

export async function loadSettlementsForExport(filters: SettlementFilters, sort: SortState, max: number): Promise<SettlementRow[]> {
  const rows = await prisma.settlementBatch.findMany({ where: whereFor(filters), orderBy: [{ [sort.key]: sort.dir }], take: max, select: BATCH_SELECT });
  return rows.map(toSettlementRow);
}

export async function loadSettlement(id: string): Promise<{ batch: SettlementRow; lines: SettlementLineRow[] } | null> {
  const r = await prisma.settlementBatch.findUnique({ where: { id }, select: { ...BATCH_SELECT, lines: { orderBy: { occurredAt: "asc" } } } });
  if (!r) return null;
  const { lines, ...rest } = r;
  return {
    batch: toSettlementRow(rest),
    lines: lines.map((l) => ({
      id: l.id,
      kind: isLineKind(l.kind) ? l.kind : "payment",
      paymentId: l.paymentId,
      refundId: l.refundId,
      chargebackId: l.chargebackId,
      method: l.method,
      description: l.description,
      amount: l.amount,
      fee: l.fee,
      occurredAt: l.occurredAt,
    })),
  };
}

/** Batches of one merchant (merchant detail tab and merchant API). */
export async function loadMerchantSettlements(merchantId: string, mode: DataMode, take = 24): Promise<SettlementRow[]> {
  const rows = await prisma.settlementBatch.findMany({ where: { merchantId, livemode: mode === "live" }, orderBy: { periodFrom: "desc" }, take, select: BATCH_SELECT });
  return rows.map(toSettlementRow);
}
