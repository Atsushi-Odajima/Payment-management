// Contract plans and fee rates (B-1). A merchant's contract is a list of
// MerchantFeeSchedule rows; the one with the latest effectiveFrom that is not
// in the future is current. Standard / premium carry fixed default rates,
// custom lets the operator enter each rate.

import { z } from "zod";
import { parseDateInTz } from "@/lib/time";

export const CONTRACT_PLANS = ["standard", "premium", "custom"] as const;
export type ContractPlan = (typeof CONTRACT_PLANS)[number];

export function isContractPlan(v: unknown): v is ContractPlan {
  return typeof v === "string" && (CONTRACT_PLANS as readonly string[]).includes(v);
}

/** Methods that carry a fee rate ("other" providers have none). */
export const FEE_METHODS = ["credit", "qr", "convenience", "bank"] as const;
export type FeeMethod = (typeof FEE_METHODS)[number];

export function isFeeMethod(v: unknown): v is FeeMethod {
  return typeof v === "string" && (FEE_METHODS as readonly string[]).includes(v);
}

export interface FeeRate {
  /** Percent of the amount, up to two decimals (e.g. 3.6). */
  ratePercent: number;
  /** Fixed fee per transaction in yen. */
  fixedFee: number;
}
export type FeeRates = Record<FeeMethod, FeeRate>;

export const PLAN_DEFAULT_RATES: Record<Exclude<ContractPlan, "custom">, FeeRates> = {
  standard: {
    credit: { ratePercent: 3.6, fixedFee: 0 },
    qr: { ratePercent: 3.0, fixedFee: 0 },
    convenience: { ratePercent: 3.5, fixedFee: 30 },
    bank: { ratePercent: 2.0, fixedFee: 50 },
  },
  premium: {
    credit: { ratePercent: 3.2, fixedFee: 0 },
    qr: { ratePercent: 2.6, fixedFee: 0 },
    convenience: { ratePercent: 3.0, fixedFee: 30 },
    bank: { ratePercent: 1.5, fixedFee: 50 },
  },
};

const feeRateSchema = z.object({
  ratePercent: z
    .number({ invalid_type_error: "number" })
    .min(0, "range")
    .max(100, "range")
    .refine((v) => Math.round(v * 100) === v * 100, "decimals"),
  fixedFee: z.number({ invalid_type_error: "number" }).int("integer").min(0, "range").max(100_000, "range"),
});

export const feeRatesSchema = z.object({
  credit: feeRateSchema,
  qr: feeRateSchema,
  convenience: feeRateSchema,
  bank: feeRateSchema,
}) satisfies z.ZodType<FeeRates>;

export const feeScheduleInputSchema = z.object({
  plan: z.enum(CONTRACT_PLANS),
  /** Only honoured for the custom plan; standard / premium use PLAN_DEFAULT_RATES. */
  rates: feeRatesSchema.optional(),
  /** YYYY-MM-DD in the business time zone; defaults to today. */
  effectiveFrom: z
    .string()
    .trim()
    .refine((v) => v === "" || parseDateInTz(v) !== null, "date")
    .default(""),
  note: z.string().trim().max(200, "tooLong").default(""),
});
export type FeeScheduleInput = z.infer<typeof feeScheduleInputSchema>;

/** Rates that apply for a plan (custom requires explicit rates). */
export function ratesForPlan(plan: ContractPlan, custom?: FeeRates): FeeRates {
  if (plan === "custom") return custom ?? PLAN_DEFAULT_RATES.standard;
  return PLAN_DEFAULT_RATES[plan];
}

/** Parse stored JSON rates; malformed data falls back to the standard plan. */
export function parseFeeRates(json: string): FeeRates {
  try {
    const r = feeRatesSchema.safeParse(JSON.parse(json));
    return r.success ? r.data : PLAN_DEFAULT_RATES.standard;
  } catch {
    return PLAN_DEFAULT_RATES.standard;
  }
}

export interface FeeScheduleView {
  id: string;
  plan: ContractPlan;
  rates: FeeRates;
  effectiveFrom: Date;
  note: string | null;
  createdAt: Date;
  /** The schedule in force now. */
  current: boolean;
  /** Effective date is still in the future. */
  upcoming: boolean;
}

/** Index of the schedule in force at `now` (latest effectiveFrom <= now), or -1. */
export function currentScheduleIndex(schedules: readonly { effectiveFrom: Date }[], now: Date): number {
  let best = -1;
  for (let i = 0; i < schedules.length; i++) {
    const s = schedules[i];
    if (s.effectiveFrom.getTime() <= now.getTime() && (best === -1 || s.effectiveFrom.getTime() >= schedules[best].effectiveFrom.getTime())) {
      best = i;
    }
  }
  return best;
}

export function toFeeScheduleViews(
  rows: readonly { id: string; plan: string; rates: string; effectiveFrom: Date; note: string | null; createdAt: Date }[],
  now: Date,
): FeeScheduleView[] {
  const current = currentScheduleIndex(rows, now);
  return rows.map((r, i) => ({
    id: r.id,
    plan: isContractPlan(r.plan) ? r.plan : "custom",
    rates: parseFeeRates(r.rates),
    effectiveFrom: r.effectiveFrom,
    note: r.note,
    createdAt: r.createdAt,
    current: i === current,
    upcoming: r.effectiveFrom.getTime() > now.getTime(),
  }));
}

/** Fee for one transaction (rounded down to the yen). */
export function calculateFee(rates: FeeRates, method: FeeMethod, amount: number): number {
  const r = rates[method];
  return Math.floor((amount * r.ratePercent) / 100) + r.fixedFee;
}
