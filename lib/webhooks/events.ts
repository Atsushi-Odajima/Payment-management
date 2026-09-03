// Provider-neutral webhook event vocabulary used by the demo endpoint.
// Real PSPs differ (Stripe: payment_intent.succeeded, PayPay: PAYMENT_COMPLETED…);
// a production integration would add a per-provider adapter that maps the
// vendor payload onto these types.

import type { PaymentAction } from "@/lib/payments/transitions";

export const WEBHOOK_SIGNATURE_HEADER = "wirepay-signature";

export const WEBHOOK_EVENT_TYPES = [
  "payment.captured",
  "payment.failed",
  "payment.cancelled",
  "payment.refunded",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

/**
 * Outbound merchant notification events (Phase E). Sent to the merchant's
 * notifyUrl by lib/webhooks/deliver.ts.
 */
export const MERCHANT_WEBHOOK_EVENTS = [
  "payment.completed",
  "payment.failed",
  "payment.expired",
  "payment.cancelled",
  "refund.completed",
  "chargeback.opened",
  "limit.exceeded",
  "subscription.charged",
  "subscription.payment_failed",
  "subscription.suspended",
] as const;
export type MerchantWebhookEvent = (typeof MERCHANT_WEBHOOK_EVENTS)[number];

export function isMerchantWebhookEvent(v: unknown): v is MerchantWebhookEvent {
  return typeof v === "string" && (MERCHANT_WEBHOOK_EVENTS as readonly string[]).includes(v);
}

export const EVENT_TO_ACTION: Record<WebhookEventType, PaymentAction> = {
  "payment.captured": "capture",
  "payment.failed": "fail",
  "payment.cancelled": "cancel",
  "payment.refunded": "refund",
};
