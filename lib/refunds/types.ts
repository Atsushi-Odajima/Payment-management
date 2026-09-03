// Refund request vocabulary (Phase C). A refund is a row of the Refund table
// with a status; the payment itself only moves through the state machine
// when a request is approved (lib/refunds/service.ts).

import { z } from "zod";

export const REFUND_KINDS = ["full", "partial"] as const;
export type RefundKind = (typeof REFUND_KINDS)[number];

export const REFUND_REASONS = ["customer", "defect", "duplicate", "other"] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];

export const REFUND_STATUSES = ["requested", "approved", "rejected", "processing", "completed", "failed"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

/** Statuses that still reserve part of the refundable balance. */
export const PENDING_REFUND_STATUSES: readonly RefundStatus[] = ["requested", "approved", "processing"];

const includes = (list: readonly string[], v: unknown): boolean => typeof v === "string" && list.includes(v);
export const isRefundKind = (v: unknown): v is RefundKind => includes(REFUND_KINDS, v);
export const isRefundReason = (v: unknown): v is RefundReason => includes(REFUND_REASONS, v);
export const isRefundStatus = (v: unknown): v is RefundStatus => includes(REFUND_STATUSES, v);

export const refundRequestSchema = z.object({
  paymentId: z.string().min(1).max(64),
  amount: z.number({ invalid_type_error: "number" }).int("integer").positive("range").max(99_999_999, "range"),
  reasonCode: z.enum(REFUND_REASONS),
  reason: z.string().trim().max(500, "tooLong").default(""),
  /** Master only: refund after the merchant's refund window has passed. */
  force: z.boolean().default(false),
});
export type RefundRequestInput = z.infer<typeof refundRequestSchema>;

export const refundDecisionSchema = z.object({
  note: z.string().trim().max(500, "tooLong").default(""),
});
