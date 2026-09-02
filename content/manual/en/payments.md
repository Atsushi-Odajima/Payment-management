# Payments

Search and refund **completed transactions** (Completed / Partially refunded / Refunded). Transactions that have not completed yet (applied, awaiting transfer, authorized…) live under [Payment Applications](/manual/applications); both screens share the same detail view.

## Sales summary

Above the list you see **net sales (gross − refunds)**, **today's sales** and the **shown / total count**. The test / live switch filters by provider mode.

## Filters

Filter by status (Completed / Partially refunded / Refunded), payment method, merchant, applied-date range and test / live. Rows are ordered by completion time, newest first.

## Creating a payment

Use **+ Create Payment** and enter the merchant, provider, order number, amount, product and user name / user ID.

- For cards / QR, “Complete immediately” creates the transaction as **Completed**; otherwise it starts **Authorized**.
- Konbini payments start **Applied** (waiting for the customer).
- Bank transfers get a **transfer ID** of the merchant's configured length (7 or 8 digits) and a 7-day deadline, and start **Awaiting transfer**.
- Requests carry an idempotency key, so a retry from the same form never creates a duplicate.

## Transaction detail

Shows the transaction (merchant, product, user, method, applied / completed time), the bank-transfer block (transfer ID, deadline, deposited amount, short / excess) where applicable, the **status history** (when / who / from → to) and refunds.

## Actions (detail screen)

| Action | Allowed from | Result | Role |
|---|---|---|---|
| Mark completed | Applied / Authorized | Completed | master |
| Mark failed | Applied / Authorized | Failed | master |
| Cancel | Applied / Awaiting transfer / Authorized | Cancelled | master |
| Mark expired | Overdue awaiting transfer | Expired | master |
| Reconcile deposit | Awaiting transfer | Completed, or still awaiting (short) | master |
| Refund | Completed / Partially refunded | Partially refunded or Refunded | logged in |

Refunds take an amount and can be repeated up to the remaining balance. Every action is written to the **status history**.

## Simulate a webhook

For providers with a webhook secret (Stripe, Custom Webhook), the detail screen can **send a signed notification to this server** so you can watch signature verification, deduplication and the state transition happen (`payment.captured` completes, `payment.failed` fails the transaction).
