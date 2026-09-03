// Aggregated reports (Phase G-1): KPIs, a time series (daily / monthly),
// method share and a merchant ranking for a period, filtered by merchant,
// method and mode. Computed in memory from the period's transactions, which
// the demo caps at a few thousand rows.

import { prisma } from "@/lib/db";
import type { DataMode } from "@/lib/mode";
import { PAYMENT_METHODS, isPaymentMethod, type PaymentMethod } from "@/lib/payments/methods";
import type { QueryParams } from "@/lib/query";
import { partsInTz, ymd } from "@/lib/settlements/schedule";
import { nextDayInTz, parseDateInTz } from "@/lib/time";

export const REPORT_GRANULARITIES = ["daily", "monthly", "custom"] as const;
export type ReportGranularity = (typeof REPORT_GRANULARITIES)[number];
export function isReportGranularity(v: unknown): v is ReportGranularity {
  return typeof v === "string" && (REPORT_GRANULARITIES as readonly string[]).includes(v);
}

export interface ReportFilters {
  granularity: ReportGranularity;
  /** Inclusive YYYY-MM-DD. */
  from: string;
  to: string;
  merchant: string;
  method: PaymentMethod | "";
  mode: DataMode;
}

export interface ReportTotals {
  applications: number;
  completed: number;
  completedAmount: number;
  successRate: number;
  abandonRate: number;
  averageAmount: number;
  refundAmount: number;
  refundRate: number;
  chargebackCount: number;
  chargebackRate: number;
}

export interface ReportPoint {
  /** YYYY-MM-DD or YYYY-MM. */
  bucket: string;
  applications: number;
  completed: number;
  amount: number;
}

export interface ReportShare {
  method: PaymentMethod;
  count: number;
  amount: number;
}

export interface ReportRank {
  merchantId: string;
  merchantCode: string;
  siteName: string;
  completed: number;
  amount: number;
}

export interface ReportDetailRow {
  id: string;
  createdAt: Date;
  orderNumber: string;
  merchantCode: string;
  method: string;
  status: string;
  amount: number;
  amountRefunded: number;
}

export interface Report {
  filters: ReportFilters;
  totals: ReportTotals;
  series: ReportPoint[];
  shares: ReportShare[];
  ranking: ReportRank[];
  merchants: { id: string; merchantCode: string; siteName: string }[];
}

export function defaultPeriod(granularity: ReportGranularity, now: Date = new Date()): { from: string; to: string } {
  const p = partsInTz(now);
  if (granularity === "monthly") return { from: ymd({ y: p.y, m: 1, d: 1 }), to: ymd(p) };
  const start = new Date(now.getTime() - 29 * 86_400_000);
  return { from: ymd(partsInTz(start)), to: ymd(p) };
}

export function parseReportFilters(q: QueryParams | undefined, mode: DataMode, now: Date = new Date()): ReportFilters {
  const granularity = isReportGranularity(q?.granularity) ? q!.granularity! : "daily";
  const def = defaultPeriod(granularity, now);
  return {
    granularity,
    from: parseDateInTz(q?.from) ? q!.from!.trim() : def.from,
    to: parseDateInTz(q?.to) ? q!.to!.trim() : def.to,
    merchant: (q?.merchant ?? "").trim().slice(0, 64),
    method: isPaymentMethod(q?.method) ? q!.method! : "",
    mode,
  };
}

const COMPLETED = new Set(["captured", "partially_refunded", "refunded", "chargeback"]);
const ABANDONED = new Set(["expired", "cancelled"]);

function bucketOf(date: Date, granularity: ReportGranularity): string {
  const p = partsInTz(date);
  return granularity === "monthly" ? `${p.y}-${String(p.m).padStart(2, "0")}` : ymd(p);
}

const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

export async function buildReport(filters: ReportFilters): Promise<Report> {
  const from = parseDateInTz(filters.from)!;
  const to = nextDayInTz(parseDateInTz(filters.to)!);
  const where = {
    livemode: filters.mode === "live",
    createdAt: { gte: from, lt: to },
    ...(filters.merchant ? { merchantId: filters.merchant } : {}),
    ...(filters.method ? { method: filters.method } : {}),
  };
  const [rows, merchants, chargebacks] = await Promise.all([
    prisma.payment.findMany({
      where,
      select: { id: true, createdAt: true, status: true, amount: true, amountRefunded: true, method: true, merchantId: true, merchant: { select: { merchantCode: true, siteName: true } } },
      orderBy: { createdAt: "asc" },
      take: 5000,
    }),
    prisma.merchant.findMany({ orderBy: { merchantCode: "asc" }, select: { id: true, merchantCode: true, siteName: true } }),
    prisma.chargeback.count({ where: { livemode: filters.mode === "live", occurredAt: { gte: from, lt: to }, ...(filters.merchant ? { merchantId: filters.merchant } : {}) } }),
  ]);

  const totals: ReportTotals = { applications: rows.length, completed: 0, completedAmount: 0, successRate: 0, abandonRate: 0, averageAmount: 0, refundAmount: 0, refundRate: 0, chargebackCount: chargebacks, chargebackRate: 0 };
  const series = new Map<string, ReportPoint>();
  const shares = new Map<PaymentMethod, ReportShare>();
  const ranking = new Map<string, ReportRank>();
  let abandoned = 0;
  for (const r of rows) {
    const bucket = bucketOf(r.createdAt, filters.granularity === "custom" ? "daily" : filters.granularity);
    const point = series.get(bucket) ?? { bucket, applications: 0, completed: 0, amount: 0 };
    point.applications++;
    const done = COMPLETED.has(r.status);
    if (done) {
      point.completed++;
      point.amount += r.amount;
      totals.completed++;
      totals.completedAmount += r.amount;
      totals.refundAmount += r.amountRefunded;
      const method = isPaymentMethod(r.method) ? r.method : "other";
      const share = shares.get(method) ?? { method, count: 0, amount: 0 };
      share.count++;
      share.amount += r.amount;
      shares.set(method, share);
      if (r.merchantId && r.merchant) {
        const rank = ranking.get(r.merchantId) ?? { merchantId: r.merchantId, merchantCode: r.merchant.merchantCode, siteName: r.merchant.siteName, completed: 0, amount: 0 };
        rank.completed++;
        rank.amount += r.amount;
        ranking.set(r.merchantId, rank);
      }
    }
    if (ABANDONED.has(r.status)) abandoned++;
    series.set(bucket, point);
  }
  totals.successRate = pct(totals.completed, totals.applications);
  totals.abandonRate = pct(abandoned, totals.applications);
  totals.averageAmount = totals.completed > 0 ? Math.round(totals.completedAmount / totals.completed) : 0;
  totals.refundRate = pct(totals.refundAmount, totals.completedAmount);
  totals.chargebackRate = pct(chargebacks, totals.completed);

  return {
    filters,
    totals,
    series: [...series.values()].sort((a, b) => a.bucket.localeCompare(b.bucket)),
    shares: PAYMENT_METHODS.map((m) => shares.get(m)).filter((s): s is ReportShare => !!s && s.count > 0),
    ranking: [...ranking.values()].sort((a, b) => b.amount - a.amount).slice(0, 10),
    merchants,
  };
}

export async function loadReportDetail(filters: ReportFilters, max: number): Promise<ReportDetailRow[]> {
  const from = parseDateInTz(filters.from)!;
  const to = nextDayInTz(parseDateInTz(filters.to)!);
  const rows = await prisma.payment.findMany({
    where: { livemode: filters.mode === "live", createdAt: { gte: from, lt: to }, ...(filters.merchant ? { merchantId: filters.merchant } : {}), ...(filters.method ? { method: filters.method } : {}) },
    orderBy: { createdAt: "asc" },
    take: max,
    select: { id: true, createdAt: true, orderNumber: true, method: true, status: true, amount: true, amountRefunded: true, merchant: { select: { merchantCode: true } } },
  });
  return rows.map((r) => ({ id: r.id, createdAt: r.createdAt, orderNumber: r.orderNumber, merchantCode: r.merchant?.merchantCode ?? "", method: r.method ?? "", status: r.status, amount: r.amount, amountRefunded: r.amountRefunded }));
}
