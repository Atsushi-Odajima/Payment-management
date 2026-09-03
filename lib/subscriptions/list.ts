// Loaders for the subscription screens (plans, subscription list / detail).

import { prisma } from "@/lib/db";
import type { DataMode } from "@/lib/mode";
import { parseSort, type QueryParams, type SortState } from "@/lib/query";
import { PLAN_SELECT, SUBSCRIPTION_SELECT } from "./service";
import { isPlanInterval, isSubscriptionStatus, type PlanInterval, type SubscriptionStatus } from "./types";

export interface PlanRow {
  id: string;
  merchant: { id: string; merchantCode: string; siteName: string };
  name: string;
  amount: number;
  interval: PlanInterval;
  trialDays: number;
  active: boolean;
  subscriptionCount: number;
  createdAt: Date;
}

export interface SubscriptionRow {
  id: string;
  merchant: { id: string; merchantCode: string; siteName: string };
  plan: { id: string; name: string; amount: number; interval: PlanInterval; trialDays: number };
  customerId: string;
  customerName: string;
  customerEmail: string | null;
  status: SubscriptionStatus;
  livemode: boolean;
  nextChargeAt: Date | null;
  startedAt: Date;
  cancelledAt: Date | null;
  lastChargeAt: Date | null;
  failCount: number;
  createdAt: Date;
}

export interface ChargeRow {
  id: string;
  orderNumber: string;
  amount: number;
  status: string;
  failureReason: string | null;
  createdAt: Date;
}

export interface SubscriptionFilters {
  status: SubscriptionStatus | "";
  merchant: string;
  mode: DataMode;
}

export const SUBSCRIPTION_SORT_KEYS = ["nextChargeAt", "status", "startedAt", "customerName"] as const;

export function parseSubscriptionFilters(q: QueryParams | undefined, mode: DataMode): SubscriptionFilters {
  return { status: isSubscriptionStatus(q?.status) ? q!.status! : "", merchant: (q?.merchant ?? "").trim().slice(0, 64), mode };
}

export function parseSubscriptionSort(q: QueryParams | undefined): SortState {
  return parseSort(q, SUBSCRIPTION_SORT_KEYS, { key: "nextChargeAt", dir: "asc" });
}

type RawPlan = { id: string; merchant: PlanRow["merchant"]; name: string; amount: number; interval: string; trialDays: number; active: boolean; createdAt: Date; _count: { subscriptions: number } };
export const toPlanRow = (p: RawPlan): PlanRow => ({ id: p.id, merchant: p.merchant, name: p.name, amount: p.amount, interval: isPlanInterval(p.interval) ? p.interval : "monthly", trialDays: p.trialDays, active: p.active, subscriptionCount: p._count.subscriptions, createdAt: p.createdAt });

type RawSub = Omit<SubscriptionRow, "status" | "plan"> & { status: string; plan: { id: string; name: string; amount: number; interval: string; trialDays: number } };
export const toSubscriptionRow = (s: RawSub): SubscriptionRow => ({
  ...s,
  status: isSubscriptionStatus(s.status) ? s.status : "active",
  plan: { ...s.plan, interval: isPlanInterval(s.plan.interval) ? s.plan.interval : "monthly" },
});

export async function loadPlans(): Promise<PlanRow[]> {
  const rows = await prisma.plan.findMany({ orderBy: [{ merchantId: "asc" }, { createdAt: "asc" }], select: PLAN_SELECT });
  return rows.map(toPlanRow);
}

export async function loadPlan(id: string): Promise<PlanRow | null> {
  const p = await prisma.plan.findUnique({ where: { id }, select: PLAN_SELECT });
  return p ? toPlanRow(p) : null;
}

export async function loadSubscriptions(opts: { filters: SubscriptionFilters; sort: SortState; page: number; pageSize: number }) {
  const f = opts.filters;
  const where = { livemode: f.mode === "live", ...(f.status ? { status: f.status } : {}), ...(f.merchant ? { merchantId: f.merchant } : {}) };
  const [rows, total, merchants, pastDueCount] = await Promise.all([
    prisma.subscription.findMany({ where, orderBy: [{ [opts.sort.key]: opts.sort.dir }, { createdAt: "desc" }], skip: (opts.page - 1) * opts.pageSize, take: opts.pageSize, select: SUBSCRIPTION_SELECT }),
    prisma.subscription.count({ where }),
    prisma.merchant.findMany({ orderBy: { merchantCode: "asc" }, select: { id: true, merchantCode: true, siteName: true } }),
    prisma.subscription.count({ where: { livemode: f.mode === "live", status: { in: ["past_due", "suspended"] } } }),
  ]);
  return { rows: rows.map(toSubscriptionRow), total, merchants, pastDueCount };
}

export async function loadSubscription(id: string): Promise<{ subscription: SubscriptionRow; charges: ChargeRow[] } | null> {
  const s = await prisma.subscription.findUnique({ where: { id }, select: SUBSCRIPTION_SELECT });
  if (!s) return null;
  const charges = await prisma.payment.findMany({ where: { subscriptionId: id }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, orderNumber: true, amount: true, status: true, failureReason: true, createdAt: true } });
  return { subscription: toSubscriptionRow(s), charges };
}
