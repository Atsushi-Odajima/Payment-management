// Transaction limits per merchant and payment method (B-2): per transaction,
// per day and per month (business time zone). Checked when a transaction is
// created; an exceeding transaction is recorded as failed with
// failureReason "limit_exceeded:<which>".

import { z } from "zod";
import type { Prisma, PrismaClient } from "@prisma/client";
import { FEE_METHODS, isFeeMethod, type FeeMethod } from "./fees";
import { startOfDayInTz, startOfMonthInTz } from "@/lib/time";

type Db = PrismaClient | Prisma.TransactionClient;

export interface LimitInput {
  method: FeeMethod;
  perTransaction: number | null;
  daily: number | null;
  monthly: number | null;
}

const amountOrNull = z.number({ invalid_type_error: "number" }).int("integer").positive("range").max(999_999_999, "range").nullable();

export const limitsInputSchema = z
  .array(
    z.object({
      method: z.enum(FEE_METHODS),
      perTransaction: amountOrNull.default(null),
      daily: amountOrNull.default(null),
      monthly: amountOrNull.default(null),
    }),
  )
  .max(FEE_METHODS.length)
  .refine((list) => new Set(list.map((l) => l.method)).size === list.length, "duplicate");

/** Statuses that consume the limit (everything except failed / cancelled / expired). */
export const COUNTED_STATUSES = ["pending", "awaiting_transfer", "authorized", "captured", "partially_refunded", "refunded"] as const;

export interface LimitUsage {
  method: FeeMethod;
  todayAmount: number;
  todayCount: number;
  monthAmount: number;
  monthCount: number;
}

export type LimitReason = "per_transaction" | "daily" | "monthly";

export type LimitVerdict = { ok: true } | { ok: false; reason: LimitReason; limit: number; current: number };

export function limitsView(rows: readonly { method: string; perTransaction: number | null; daily: number | null; monthly: number | null }[]): LimitInput[] {
  return rows.filter((r) => isFeeMethod(r.method)).map((r) => ({ method: r.method as FeeMethod, perTransaction: r.perTransaction, daily: r.daily, monthly: r.monthly }));
}

export async function usageFor(
  db: Db,
  opts: { merchantId: string; method: FeeMethod; livemode: boolean; now?: Date },
): Promise<LimitUsage> {
  const now = opts.now ?? new Date();
  const base = { merchantId: opts.merchantId, method: opts.method, livemode: opts.livemode, status: { in: [...COUNTED_STATUSES] } };
  const [today, month] = await Promise.all([
    db.payment.aggregate({ where: { ...base, createdAt: { gte: startOfDayInTz(now) } }, _sum: { amount: true }, _count: true }),
    db.payment.aggregate({ where: { ...base, createdAt: { gte: startOfMonthInTz(now) } }, _sum: { amount: true }, _count: true }),
  ]);
  return {
    method: opts.method,
    todayAmount: today._sum.amount ?? 0,
    todayCount: today._count,
    monthAmount: month._sum.amount ?? 0,
    monthCount: month._count,
  };
}

/** Pure decision given the limit row and current usage. */
export function evaluateLimit(
  limit: { perTransaction: number | null; daily: number | null; monthly: number | null } | null,
  usage: { todayAmount: number; monthAmount: number },
  amount: number,
): LimitVerdict {
  if (!limit) return { ok: true };
  if (limit.perTransaction !== null && amount > limit.perTransaction) {
    return { ok: false, reason: "per_transaction", limit: limit.perTransaction, current: amount };
  }
  if (limit.daily !== null && usage.todayAmount + amount > limit.daily) {
    return { ok: false, reason: "daily", limit: limit.daily, current: usage.todayAmount };
  }
  if (limit.monthly !== null && usage.monthAmount + amount > limit.monthly) {
    return { ok: false, reason: "monthly", limit: limit.monthly, current: usage.monthAmount };
  }
  return { ok: true };
}

export async function checkLimit(
  db: Db,
  opts: { merchantId: string; method: string; amount: number; livemode: boolean; now?: Date },
): Promise<LimitVerdict> {
  if (!isFeeMethod(opts.method)) return { ok: true };
  const limit = await db.merchantLimit.findUnique({
    where: { merchantId_method: { merchantId: opts.merchantId, method: opts.method } },
    select: { perTransaction: true, daily: true, monthly: true },
  });
  if (!limit || (limit.perTransaction === null && limit.daily === null && limit.monthly === null)) return { ok: true };
  const usage = await usageFor(db, { merchantId: opts.merchantId, method: opts.method, livemode: opts.livemode, now: opts.now });
  return evaluateLimit(limit, usage, opts.amount);
}

export const LIMIT_FAILURE_PREFIX = "limit_exceeded:";

export function limitFailureReason(reason: LimitReason): string {
  return `${LIMIT_FAILURE_PREFIX}${reason}`;
}
