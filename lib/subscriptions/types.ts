// Recurring billing vocabulary (Phase H-1).

import { z } from "zod";

export const PLAN_INTERVALS = ["monthly", "yearly", "weekly"] as const;
export type PlanInterval = (typeof PLAN_INTERVALS)[number];

export const SUBSCRIPTION_STATUSES = ["trialing", "active", "past_due", "suspended", "cancelled"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const SUBSCRIPTION_ACTIONS = ["charge", "pause", "resume", "cancel"] as const;
export type SubscriptionAction = (typeof SUBSCRIPTION_ACTIONS)[number];

const includes = (list: readonly string[], v: unknown): boolean => typeof v === "string" && list.includes(v);
export const isPlanInterval = (v: unknown): v is PlanInterval => includes(PLAN_INTERVALS, v);
export const isSubscriptionStatus = (v: unknown): v is SubscriptionStatus => includes(SUBSCRIPTION_STATUSES, v);
export const isSubscriptionAction = (v: unknown): v is SubscriptionAction => includes(SUBSCRIPTION_ACTIONS, v);

/** Retry schedule after a failed charge: 3 days, then 7 days; the third failure suspends. */
export const RETRY_DAYS = [3, 7] as const;
export const MAX_CHARGE_FAILURES = 3;

export const planInputSchema = z.object({
  merchantId: z.string().min(1).max(64),
  name: z.string().trim().min(1, "required").max(80, "tooLong"),
  amount: z.number({ invalid_type_error: "number" }).int("integer").positive("range").max(9_999_999, "range"),
  interval: z.enum(PLAN_INTERVALS),
  trialDays: z.number({ invalid_type_error: "number" }).int("integer").min(0, "range").max(365, "range").default(0),
  active: z.boolean().default(true),
});
export type PlanInput = z.infer<typeof planInputSchema>;

export const planUpdateSchema = planInputSchema.omit({ merchantId: true });

export const subscriptionInputSchema = z.object({
  planId: z.string().min(1).max(64),
  customerId: z.string().trim().min(1, "required").max(64, "tooLong"),
  customerName: z.string().trim().min(1, "required").max(120, "tooLong"),
  customerEmail: z.string().trim().email("email").max(200, "tooLong").or(z.literal("")).default(""),
});
export type SubscriptionInput = z.infer<typeof subscriptionInputSchema>;

export const demoChargeSettingsSchema = z.object({
  demoChargeFailPercent: z.number({ invalid_type_error: "number" }).int("integer").min(0, "range").max(100, "range"),
});

/** Add one billing interval to a date (calendar months / years, 7-day weeks). */
export function addInterval(date: Date, interval: PlanInterval): Date {
  const d = new Date(date.getTime());
  if (interval === "weekly") return new Date(d.getTime() + 7 * 86_400_000);
  if (interval === "monthly") d.setUTCMonth(d.getUTCMonth() + 1);
  else d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d;
}
