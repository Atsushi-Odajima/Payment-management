// Server-side loader shared by the two transaction lists:
//   /applications — statuses in APPLICATION_STATUSES (not yet completed)
//   /payments     — statuses in SALES_STATUSES (completed / refunded)
// Both are the same Payment table with a different status set, the same
// filters (method, status, merchant, period, test/live) and the same row
// shape, so the list view is one component.

import { prisma } from "@/lib/db";
import { DEMO_LIMITS } from "@/lib/demo";
import { isPaymentMethod, toPaymentMethod, type PaymentMethod } from "@/lib/payments/methods";
import { isPaymentStatus, toPaymentStatus, type PaymentStatus } from "@/lib/payments/transitions";
import { isDepositDiff, isTransferOverdue, type DepositDiff } from "@/lib/payments/transfer";
import { nextDayInTz, parseDateInTz } from "@/lib/time";
import { toModeFilter, type ModeFilter } from "@/lib/utils";

export interface TransactionListItem {
  id: string;
  orderNumber: string;
  externalId: string | null;
  providerKey: string;
  providerDisplayName: string;
  merchant: { id: string; merchantCode: string; siteName: string } | null;
  method: PaymentMethod;
  productName: string | null;
  customerName: string | null;
  customerId: string | null;
  amount: number;
  amountRefunded: number;
  status: PaymentStatus;
  livemode: boolean;
  createdAt: Date;
  capturedAt: Date | null;
  transferId: string | null;
  transferDueAt: Date | null;
  depositAmount: number | null;
  depositDiff: DepositDiff | null;
  /** awaiting_transfer with a deadline in the past. */
  overdue: boolean;
}

export interface TransactionFilters {
  status: PaymentStatus | "";
  method: PaymentMethod | "";
  merchant: string;
  /** YYYY-MM-DD (business time zone), inclusive. */
  from: string;
  to: string;
  mode: ModeFilter;
}

export interface MerchantOption {
  id: string;
  merchantCode: string;
  siteName: string;
}

export interface TransactionListResult {
  items: TransactionListItem[];
  total: number;
  filters: TransactionFilters;
  merchants: MerchantOption[];
}

/** Narrow raw query params into filters; unknown values fall back to "all". */
export function parseTransactionFilters(
  q: Record<string, string | undefined> | undefined,
  allowedStatuses: readonly PaymentStatus[],
): TransactionFilters {
  const status = isPaymentStatus(q?.status) && allowedStatuses.includes(q.status) ? q.status : "";
  const method = isPaymentMethod(q?.method) ? q.method : "";
  const from = parseDateInTz(q?.from) ? q!.from!.trim() : "";
  const to = parseDateInTz(q?.to) ? q!.to!.trim() : "";
  return { status, method, merchant: (q?.merchant ?? "").trim().slice(0, 64), from, to, mode: toModeFilter(q?.mode) };
}

export const TRANSACTION_SELECT = {
  id: true,
  orderNumber: true,
  externalId: true,
  method: true,
  productName: true,
  customerName: true,
  customerId: true,
  amount: true,
  amountRefunded: true,
  status: true,
  livemode: true,
  createdAt: true,
  capturedAt: true,
  transferId: true,
  transferDueAt: true,
  depositAmount: true,
  depositDiff: true,
  provider: { select: { providerKey: true, displayName: true, category: true } },
  merchant: { select: { id: true, merchantCode: true, siteName: true } },
} as const;

type Row = {
  id: string;
  orderNumber: string;
  externalId: string | null;
  method: string | null;
  productName: string | null;
  customerName: string | null;
  customerId: string | null;
  amount: number;
  amountRefunded: number;
  status: string;
  livemode: boolean;
  createdAt: Date;
  capturedAt: Date | null;
  transferId: string | null;
  transferDueAt: Date | null;
  depositAmount: number | null;
  depositDiff: string | null;
  provider: { providerKey: string; displayName: string; category: string };
  merchant: { id: string; merchantCode: string; siteName: string } | null;
};

export function toTransactionListItem(p: Row, now: Date): TransactionListItem {
  return {
    id: p.id,
    orderNumber: p.orderNumber,
    externalId: p.externalId,
    providerKey: p.provider.providerKey,
    providerDisplayName: p.provider.displayName,
    merchant: p.merchant,
    method: toPaymentMethod(p.method ?? p.provider.category),
    productName: p.productName,
    customerName: p.customerName,
    customerId: p.customerId,
    amount: p.amount,
    amountRefunded: p.amountRefunded,
    status: toPaymentStatus(p.status),
    livemode: p.livemode,
    createdAt: p.createdAt,
    capturedAt: p.capturedAt,
    transferId: p.transferId,
    transferDueAt: p.transferDueAt,
    depositAmount: p.depositAmount,
    depositDiff: isDepositDiff(p.depositDiff) ? p.depositDiff : null,
    overdue: isTransferOverdue(p, now),
  };
}

/**
 * Ordering for the application list: transfers still awaited come first,
 * nearest deadline on top (overdue ones therefore at the very top), then
 * everything else newest first.
 */
export function compareApplications(a: TransactionListItem, b: TransactionListItem): number {
  const aWait = a.status === "awaiting_transfer" && a.transferDueAt ? 0 : 1;
  const bWait = b.status === "awaiting_transfer" && b.transferDueAt ? 0 : 1;
  if (aWait !== bWait) return aWait - bWait;
  if (aWait === 0) return a.transferDueAt!.getTime() - b.transferDueAt!.getTime();
  return b.createdAt.getTime() - a.createdAt.getTime();
}

export function compareSales(a: TransactionListItem, b: TransactionListItem): number {
  return b.createdAt.getTime() - a.createdAt.getTime();
}

export async function loadTransactions(opts: {
  allowedStatuses: readonly PaymentStatus[];
  filters: TransactionFilters;
  page: number;
  pageSize: number;
  order: "applications" | "sales";
  now?: Date;
}): Promise<TransactionListResult> {
  const { filters } = opts;
  const now = opts.now ?? new Date();
  const from = parseDateInTz(filters.from);
  const to = parseDateInTz(filters.to);
  const where = {
    status: { in: filters.status ? [filters.status] : [...opts.allowedStatuses] },
    ...(filters.method ? { method: filters.method } : {}),
    ...(filters.merchant ? { merchantId: filters.merchant } : {}),
    ...(filters.mode === "all" ? {} : { livemode: filters.mode === "live" }),
    ...(from || to
      ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: nextDayInTz(to) } : {}) } }
      : {}),
  };

  const [rows, merchants] = await Promise.all([
    // The custom ordering (deadline first) is applied in memory; the demo
    // caps payments at DEMO_LIMITS.payments so this stays small.
    prisma.payment.findMany({ where, orderBy: { createdAt: "desc" }, take: DEMO_LIMITS.payments, select: TRANSACTION_SELECT }),
    prisma.merchant.findMany({ orderBy: { merchantCode: "asc" }, select: { id: true, merchantCode: true, siteName: true } }),
  ]);

  const items = rows.map((r) => toTransactionListItem(r, now));
  items.sort(opts.order === "applications" ? compareApplications : compareSales);
  const start = (opts.page - 1) * opts.pageSize;
  return { items: items.slice(start, start + opts.pageSize), total: items.length, filters, merchants };
}
