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

export const EVENT_TO_ACTION: Record<WebhookEventType, PaymentAction> = {
  "payment.captured": "capture",
  "payment.failed": "fail",
  "payment.cancelled": "cancel",
  "payment.refunded": "refund",
};
