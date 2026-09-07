// Loaders for the deposit notification log (入金通知ログ, Phase P1-1) and its CSV.

import { prisma } from "@/lib/db";
import type { DataMode } from "@/lib/mode";
import { parseSort, type QueryParams, type SortState } from "@/lib/query";
import { nextDayInTz, parseDateInTz } from "@/lib/time";
import { DEPOSIT_NOTIFICATION_SELECT } from "./notify";
import {
  DEPOSIT_NOTIFICATION_SORT_KEYS,
  isDepositNotificationResult,
  isDepositNotificationSource,
  type DepositNotificationFilters,
  type DepositNotificationRow,
} from "./notification-types";

export function parseDepositNotificationFilters(q: QueryParams | undefined, mode: DataMode): DepositNotificationFilters {
  return {
    source: isDepositNotificationSource(q?.source) ? q!.source! : "",
    result: isDepositNotificationResult(q?.result) ? q!.result! : "",
    from: parseDateInTz(q?.from) ? q!.from!.trim() : "",
    to: parseDateInTz(q?.to) ? q!.to!.trim() : "",
    mode,
  };
}

export function parseDepositNotificationSort(q: QueryParams | undefined): SortState {
  return parseSort(q, DEPOSIT_NOTIFICATION_SORT_KEYS, { key: "createdAt", dir: "desc" });
}

type Raw = Omit<DepositNotificationRow, "source" | "result"> & { source: string; result: string };
export const toDepositNotificationRow = (r: Raw): DepositNotificationRow => ({
  ...r,
  source: isDepositNotificationSource(r.source) ? r.source : "bank",
  result: isDepositNotificationResult(r.result) ? r.result : "rejected",
});

function whereFor(f: DepositNotificationFilters) {
  const from = parseDateInTz(f.from);
  const to = parseDateInTz(f.to);
  return {
    livemode: f.mode === "live",
    ...(f.source ? { source: f.source } : {}),
    ...(f.result ? { result: f.result } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: nextDayInTz(to) } : {}) } } : {}),
  };
}

export async function loadDepositNotifications(opts: { filters: DepositNotificationFilters; sort: SortState; page: number; pageSize: number }) {
  const where = whereFor(opts.filters);
  const [rows, total] = await Promise.all([
    prisma.depositNotification.findMany({ where, orderBy: [{ [opts.sort.key]: opts.sort.dir }, { createdAt: "desc" }], skip: (opts.page - 1) * opts.pageSize, take: opts.pageSize, select: DEPOSIT_NOTIFICATION_SELECT }),
    prisma.depositNotification.count({ where }),
  ]);
  return { rows: rows.map(toDepositNotificationRow), total };
}

export async function loadDepositNotificationsForExport(filters: DepositNotificationFilters, sort: SortState, max: number): Promise<DepositNotificationRow[]> {
  const rows = await prisma.depositNotification.findMany({ where: whereFor(filters), orderBy: [{ [sort.key]: sort.dir }], take: max, select: DEPOSIT_NOTIFICATION_SELECT });
  return rows.map(toDepositNotificationRow);
}

/** Notifications that named this transaction (by id, transfer id or receipt number), newest first — the transaction detail. */
export async function loadDepositNotificationsForPayment(payment: { id: string; transferId: string | null; cvsReceiptNo: string | null }, limit = 20): Promise<DepositNotificationRow[]> {
  const or: Array<Record<string, string>> = [{ paymentId: payment.id }];
  if (payment.transferId) or.push({ transferId: payment.transferId });
  if (payment.cvsReceiptNo) or.push({ cvsReceiptNo: payment.cvsReceiptNo });
  const rows = await prisma.depositNotification.findMany({ where: { OR: or }, orderBy: { createdAt: "desc" }, take: limit, select: DEPOSIT_NOTIFICATION_SELECT });
  return rows.map(toDepositNotificationRow);
}
