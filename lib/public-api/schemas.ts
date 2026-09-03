// Request schemas of the public API v1 (Phase L-1). Client-safe (zod only);
// the OpenAPI document is generated from these (./openapi.ts) so the spec
// and the validation never drift.

import { z } from "zod";
import { CVS_BRANDS } from "@/lib/payments/konbini";
import { REFUND_REASONS } from "@/lib/refunds/types";

export const API_METHODS = ["credit", "qr", "convenience", "bank"] as const;
export type ApiMethod = (typeof API_METHODS)[number];

export const apiCardSchema = z
  .object({
    number: z.string().regex(/^\d{13,19}$/, "digits").describe("Card number (test numbers select a scenario in test mode)"),
    expMonth: z.number().int().min(1).max(12).describe("Expiry month (1-12)"),
    expYear: z.number().int().min(2024).max(2099).describe("Expiry year (4 digits)"),
    cvc: z.string().regex(/^\d{3,4}$/, "digits").optional().describe("Security code (never stored)"),
  })
  .describe("Card details; only a fingerprint and the last 4 digits are stored");

export const createTransactionApiSchema = z.object({
  method: z.enum(API_METHODS).describe("Payment method"),
  orderNumber: z.string().min(1).max(64).describe("Your order number (shown on the dashboard and in webhooks)"),
  amount: z.number().int().positive().max(99_999_999).describe("Amount in yen (JPY has no minor unit)"),
  productName: z.string().max(200).nullable().optional().describe("Product name"),
  customerName: z.string().max(120).nullable().optional().describe("Customer name"),
  customerId: z.string().max(64).nullable().optional().describe("Your customer id"),
  customerEmail: z.string().email().max(200).nullable().optional().describe("Customer e-mail (receives transfer / konbini instructions and completion mails)"),
  description: z.string().max(2000).nullable().optional().describe("Free-text memo"),
  autoCapture: z.boolean().default(true).describe("credit / qr: capture immediately (true) or leave authorized (false)"),
  card: apiCardSchema.optional(),
  cvsBrand: z.enum(CVS_BRANDS).optional().describe("convenience: the store chain the customer will pay at"),
  idempotencyKey: z.string().min(8).max(128).optional().describe("Alternative to the Idempotency-Key header"),
});
export type CreateTransactionApiInput = z.infer<typeof createTransactionApiSchema>;

export const listTransactionsQuerySchema = z.object({
  status: z.string().max(32).optional().describe("Filter by status"),
  method: z.enum(API_METHODS).optional().describe("Filter by payment method"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date").optional().describe("Created on or after (YYYY-MM-DD, JST)"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date").optional().describe("Created on or before (YYYY-MM-DD, JST)"),
  limit: z.coerce.number().int().min(1).max(100).default(20).describe("Page size (1-100)"),
  startingAfter: z.string().max(64).optional().describe("Cursor: the id of the last transaction of the previous page"),
});
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;

export const createRefundApiSchema = z.object({
  transactionId: z.string().min(1).max(64).describe("Transaction id (txn_…)"),
  amount: z.number().int().positive().max(99_999_999).optional().describe("Amount to refund; omitted = the remaining balance"),
  reasonCode: z.enum(REFUND_REASONS).default("customer").describe("Reason code"),
  reason: z.string().max(500).optional().describe("Free-text reason (required for reasonCode other)"),
});
export type CreateRefundApiInput = z.infer<typeof createRefundApiSchema>;

export const createPaymentLinkApiSchema = z.object({
  productName: z.string().trim().min(1).max(120).describe("Product name shown on the hosted page"),
  amount: z.number().int().positive().max(9_999_999).describe("Amount in yen"),
  description: z.string().trim().max(500).optional().describe("Description shown on the hosted page"),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date").optional().describe("Last valid day (YYYY-MM-DD, JST)"),
  maxUses: z.number().int().min(1).max(100_000).optional().describe("Maximum number of checkouts"),
});
export type CreatePaymentLinkApiInput = z.infer<typeof createPaymentLinkApiSchema>;

/** Error codes a client may receive from /api/v1 (documented in the OpenAPI spec). */
export const PUBLIC_API_ERROR_CODES: ReadonlyArray<{ code: string; status: number; description: string }> = [
  { code: "invalid_api_key", status: 401, description: "Missing, malformed, revoked or expired API key." },
  { code: "ip_blocked", status: 403, description: "The caller's IP is denied by the merchant's IP restrictions." },
  { code: "invalid_input", status: 400, description: "Validation failed; `details.fieldErrors` names the fields." },
  { code: "invalid_json", status: 400, description: "The request body is not valid JSON." },
  { code: "test_card_in_live", status: 400, description: "A test card number was sent to the live environment." },
  { code: "method_not_enabled", status: 400, description: "The payment method is not enabled for this merchant." },
  { code: "provider_not_found", status: 400, description: "No active provider of this method exists in this environment." },
  { code: "method_suspended", status: 409, description: "The payment method is temporarily suspended (globally or for this merchant)." },
  { code: "not_found", status: 404, description: "The resource does not exist or belongs to another merchant / environment." },
  { code: "refund_exceeds", status: 400, description: "The refund exceeds the refundable balance." },
  { code: "refund_window_expired", status: 409, description: "The merchant's refund window has passed; contact support." },
  { code: "invalid_transition", status: 409, description: "The transaction is not in a state that allows this operation." },
  { code: "demo_limit", status: 403, description: "The demo data cap was reached." },
  { code: "rate_limited", status: 429, description: "More than 60 requests per minute for this key's merchant and environment; see Retry-After." },
  { code: "internal", status: 500, description: "Unexpected server error." },
];
