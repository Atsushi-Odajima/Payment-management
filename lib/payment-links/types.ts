// Hosted payment links (Phase H-2).

import { z } from "zod";
import { PAYMENT_METHODS } from "@/lib/payments/methods";
import { CVS_BRANDS } from "@/lib/payments/konbini";

export const PAYMENT_LINK_STATUSES = ["active", "disabled"] as const;
export type PaymentLinkStatus = (typeof PAYMENT_LINK_STATUSES)[number];
export function isPaymentLinkStatus(v: unknown): v is PaymentLinkStatus {
  return typeof v === "string" && (PAYMENT_LINK_STATUSES as readonly string[]).includes(v);
}

export const paymentLinkInputSchema = z.object({
  merchantId: z.string().min(1).max(64),
  productName: z.string().trim().min(1, "required").max(120, "tooLong"),
  amount: z.number({ invalid_type_error: "number" }).int("integer").positive("range").max(9_999_999, "range"),
  description: z.string().trim().max(500, "tooLong").default(""),
  /** YYYY-MM-DD (business TZ, inclusive); empty = no expiry. */
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date").or(z.literal("")).default(""),
  /** null / 0 = unlimited. */
  maxUses: z.number({ invalid_type_error: "number" }).int("integer").min(0, "range").max(100_000, "range").nullable().default(null),
});
export type PaymentLinkInput = z.infer<typeof paymentLinkInputSchema>;

/** What a customer submits on /pay/<token>. */
export const linkCheckoutSchema = z.object({
  method: z.enum(PAYMENT_METHODS),
  customerName: z.string().trim().min(1, "required").max(120, "tooLong"),
  customerEmail: z.string().trim().email("email").max(200, "tooLong").or(z.literal("")).default(""),
  /** Konbini only (Phase K-1): the store chain the customer will pay at. */
  cvsBrand: z.enum(CVS_BRANDS).optional(),
});
export type LinkCheckoutInput = z.infer<typeof linkCheckoutSchema>;

/** Why a link cannot be used right now. */
export type LinkUnavailableReason = "disabled" | "expired" | "exhausted";
