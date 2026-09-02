# Payments

Search and operate payments created through connected providers.

## Sales summary

Above the list you see **net sales (gross − refunds)**, **today's sales** and the **shown / total count**. The test / live switch filters by provider mode.

## Filters

Filter by status (Pending / Authorized / Captured / Partially refunded / Refunded / Voided / Failed) and by test / live. The latest 100 rows are shown.

## Creating a payment

Use **+ Create Payment** and enter the provider, order number, amount and customer details.

- For cards / QR, “Capture immediately” creates the payment as **Captured**; otherwise it starts **Authorized**.
- Konbini / bank transfer payments start **Pending** (waiting for the customer) and become Captured through the provider's webhook.
- Requests carry an idempotency key, so a retry from the same form never creates a duplicate.

## Actions (detail screen)

| Action | Allowed from | Result |
|---|---|---|
| Capture | Pending / Authorized | Captured |
| Void | Pending / Authorized | Voided |
| Refund | Captured / Partially refunded | Partially refunded or Refunded |

Refunds take an amount and can be repeated up to the remaining balance. Every action is written to the **event history** as who / when / what.

## Simulate a webhook

For providers with a webhook secret (Stripe, Custom Webhook), the detail screen can **send a signed notification to this server** so you can watch signature verification, deduplication and the state transition happen.
