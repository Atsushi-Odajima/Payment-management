// Loaders for the webhook delivery log (一覧 / 詳細 / 加盟店タブ).
// Failed and abandoned deliveries come first by default.

import { prisma } from "@/lib/db";
import type { DataMode } from "@/lib/mode";
import { parseSort, type QueryParams, type SortState } from "@/lib/query";
import { nextDayInTz, parseDateInTz } from "@/lib/time";
import { isWebhookStatus, type WebhookStatus } from "./status";
import { isMerchantWebhookEvent, type MerchantWebhookEvent } from "./events";

export interface WebhookFilters {
  merchant: string;
  event: MerchantWebhookEvent | "";
  status: WebhookStatus | "";
  from: string;
  to: string;
  mode: DataMode;
}

export interface WebhookRow {
  id: string;
  merchant: { id: string; merchantCode: string; siteName: string };
  paymentId: string | null;
  livemode: boolean;
  event: string;
  url: string;
  method: string;
  responseStatus: number | null;
  attempts: number;
  status: WebhookStatus;
  nextRetryAt: Date | null;
  lastSentAt: Date | null;
  createdAt: Date;
}

export interface WebhookAttemptRow {
  id: string;
  attemptNo: number;
  sentAt: Date;
  responseStatus: number | null;
  responseBody: string | null;
  error: string | null;
  durationMs: number | null;
  trigger: string;
}

export interface WebhookDetail extends WebhookRow {
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  responseBody: string | null;
  attemptLog: WebhookAttemptRow[];
  /** The transaction the delivery is about, as it is now (Phase P3-6). */
  payment: { id: string; orderNumber: string; status: string; updatedAt: Date } | null;
  /** Last successful delivery of the same event for the same transaction (this one excluded). */
  lastSuccess: { id: string; lastSentAt: Date | null } | null;
}

export const WEBHOOK_SORT_KEYS = ["createdAt", "status", "attempts", "lastSentAt"] as const;

const ROW_SELECT = {
  id: true,
  merchant: { select: { id: true, merchantCode: true, siteName: true } },
  paymentId: true,
  livemode: true,
  event: true,
  url: true,
  method: true,
  responseStatus: true,
  attempts: true,
  status: true,
  nextRetryAt: true,
  lastSentAt: true,
  createdAt: true,
} as const;

export function parseWebhookFilters(q: QueryParams | undefined, mode: DataMode): WebhookFilters {
  return {
    merchant: (q?.merchant ?? "").trim().slice(0, 64),
    event: isMerchantWebhookEvent(q?.event) ? q!.event! : "",
    status: isWebhookStatus(q?.status) ? q!.status! : "",
    from: parseDateInTz(q?.from) ? q!.from!.trim() : "",
    to: parseDateInTz(q?.to) ? q!.to!.trim() : "",
    mode,
  };
}

export function parseWebhookSort(q: QueryParams | undefined): SortState {
  return parseSort(q, WEBHOOK_SORT_KEYS, { key: "createdAt", dir: "desc" });
}

function whereFor(f: WebhookFilters) {
  const from = parseDateInTz(f.from);
  const to = parseDateInTz(f.to);
  return {
    livemode: f.mode === "live",
    ...(f.merchant ? { merchantId: f.merchant } : {}),
    ...(f.event ? { event: f.event } : {}),
    ...(f.status ? { status: f.status } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: nextDayInTz(to) } : {}) } } : {}),
  };
}

type Raw = Omit<WebhookRow, "status"> & { status: string };
const toRow = (r: Raw): WebhookRow => ({ ...r, status: isWebhookStatus(r.status) ? r.status : "pending" });

/** Problem rows (failed / abandoned / retrying) sort before the rest on the default order. */
const PROBLEM_RANK: Record<WebhookStatus, number> = { abandoned: 0, failed: 1, retrying: 2, pending: 3, success: 4 };

export async function loadWebhookDeliveries(opts: { filters: WebhookFilters; sort: SortState; page: number; pageSize: number }) {
  const where = whereFor(opts.filters);
  const defaultOrder = opts.sort.key === "createdAt" && opts.sort.dir === "desc";
  const [rawRows, total, merchants, failedCount] = await Promise.all([
    defaultOrder
      ? prisma.webhookDelivery.findMany({ where, orderBy: { createdAt: "desc" }, take: 500, select: ROW_SELECT })
      : prisma.webhookDelivery.findMany({ where, orderBy: [{ [opts.sort.key]: opts.sort.dir }, { createdAt: "desc" }], skip: (opts.page - 1) * opts.pageSize, take: opts.pageSize, select: ROW_SELECT }),
    prisma.webhookDelivery.count({ where }),
    prisma.merchant.findMany({ orderBy: { merchantCode: "asc" }, select: { id: true, merchantCode: true, siteName: true } }),
    prisma.webhookDelivery.count({ where: { livemode: opts.filters.mode === "live", status: { in: ["failed", "abandoned", "retrying"] } } }),
  ]);
  let rows = rawRows.map(toRow);
  if (defaultOrder) {
    rows.sort((a, b) => PROBLEM_RANK[a.status] - PROBLEM_RANK[b.status] || b.createdAt.getTime() - a.createdAt.getTime());
    rows = rows.slice((opts.page - 1) * opts.pageSize, opts.page * opts.pageSize);
  }
  return { rows, total, merchants, failedCount };
}

export async function loadWebhookDeliveriesForExport(filters: WebhookFilters, sort: SortState, max: number): Promise<WebhookRow[]> {
  const rows = await prisma.webhookDelivery.findMany({ where: whereFor(filters), orderBy: [{ [sort.key]: sort.dir }], take: max, select: ROW_SELECT });
  return rows.map(toRow);
}

export async function loadWebhookDelivery(id: string): Promise<WebhookDetail | null> {
  const r = await prisma.webhookDelivery.findUnique({
    where: { id },
    select: { ...ROW_SELECT, requestHeaders: true, requestBody: true, responseBody: true, attemptLog: { orderBy: { attemptNo: "asc" } } },
  });
  if (!r) return null;
  let headers: Record<string, string> = {};
  try {
    headers = JSON.parse(r.requestHeaders) as Record<string, string>;
  } catch {
    headers = {};
  }
  const { requestHeaders: _h, attemptLog, ...rest } = r;
  void _h;
  const [payment, lastSuccess] = await Promise.all([
    r.paymentId ? prisma.payment.findUnique({ where: { id: r.paymentId }, select: { id: true, orderNumber: true, status: true, updatedAt: true } }) : Promise.resolve(null),
    r.paymentId ? prisma.webhookDelivery.findFirst({ where: { paymentId: r.paymentId, event: r.event, status: "success", id: { not: r.id } }, orderBy: { lastSentAt: "desc" }, select: { id: true, lastSentAt: true } }) : Promise.resolve(null),
  ]);
  return { ...toRow(rest), requestHeaders: headers, requestBody: r.requestBody, responseBody: r.responseBody, attemptLog, payment, lastSuccess };
}

/** Recent deliveries of one merchant (merchant detail tab). */
export async function loadMerchantWebhooks(merchantId: string, mode: DataMode, take = 30): Promise<WebhookRow[]> {
  const rows = await prisma.webhookDelivery.findMany({ where: { merchantId, livemode: mode === "live" }, orderBy: { createdAt: "desc" }, take, select: ROW_SELECT });
  return rows.map(toRow);
}
