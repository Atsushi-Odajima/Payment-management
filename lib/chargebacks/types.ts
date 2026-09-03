// Chargeback vocabulary (Phase F-1).

import { z } from "zod";

export const CHARGEBACK_REASONS = ["fraud", "not_received", "not_as_described", "duplicate", "other"] as const;
export type ChargebackReason = (typeof CHARGEBACK_REASONS)[number];

export const CHARGEBACK_STATUSES = ["received", "disputed", "won", "lost", "confirmed"] as const;
export type ChargebackStatus = (typeof CHARGEBACK_STATUSES)[number];

export const CHARGEBACK_ACTIONS = ["dispute", "resolve", "confirm"] as const;
export type ChargebackAction = (typeof CHARGEBACK_ACTIONS)[number];

const includes = (list: readonly string[], v: unknown): boolean => typeof v === "string" && list.includes(v);
export const isChargebackReason = (v: unknown): v is ChargebackReason => includes(CHARGEBACK_REASONS, v);
export const isChargebackStatus = (v: unknown): v is ChargebackStatus => includes(CHARGEBACK_STATUSES, v);
export const isChargebackAction = (v: unknown): v is ChargebackAction => includes(CHARGEBACK_ACTIONS, v);

/** Statuses that count against the merchant in settlements. */
export const CHARGEBACK_DEDUCTED_STATUSES: readonly ChargebackStatus[] = ["lost", "confirmed"];

/** Default dispute deadline: 14 days after the chargeback was received. */
export const DISPUTE_DEADLINE_DAYS = 14;

export const chargebackCreateSchema = z.object({
  paymentId: z.string().min(1).max(64),
  /** Defaults to the payment amount. */
  amount: z.number({ invalid_type_error: "number" }).int("integer").positive("range").optional(),
  reasonCode: z.enum(CHARGEBACK_REASONS),
  /** YYYY-MM-DD (business TZ); defaults to DISPUTE_DEADLINE_DAYS after today. */
  disputeDeadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date").optional().or(z.literal("")),
  evidenceNote: z.string().trim().max(2000, "tooLong").default(""),
});
export type ChargebackCreateInput = z.infer<typeof chargebackCreateSchema>;

export const chargebackDisputeSchema = z.object({ evidenceNote: z.string().trim().min(1, "required").max(2000, "tooLong") });
export const chargebackResolveSchema = z.object({ outcome: z.enum(["won", "lost"]), note: z.string().trim().max(2000, "tooLong").default("") });
