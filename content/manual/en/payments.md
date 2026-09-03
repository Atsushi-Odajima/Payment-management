# Payments

Search and refund **completed transactions** (Completed / Partially refunded / Refunded). Transactions that have not completed yet (applied, awaiting transfer, authorized…) live under [Payment Applications](/manual/applications); both screens share the same detail view.

## Sales summary

Above the list you see **net sales (gross − refunds)**, **today's sales** and the **shown / total count**. The **Test / Live** switch in the header selects the data mode (stored in a cookie and shared with Payment Applications, the dashboard and merchant limits).

## Filters

Filter by status (Completed / Partially refunded / Refunded), payment method, merchant and applied-date range. Rows are ordered by completion time, newest first.

## Creating a payment

Use **+ Create Payment** and enter the merchant, provider, order number, amount, product and user name / user ID.

- For cards / QR, “Complete immediately” creates the transaction as **Completed**; otherwise it starts **Authorized**.
- Konbini payments start **Applied** (waiting for the customer).
- Bank transfers get a **transfer ID** of the merchant's configured length (7 or 8 digits) and the merchant's transfer deadline (default 7 days; edited under “Contract & fees” in [Merchants](/manual/merchants)), and start **Awaiting transfer**. Transfers still awaited after the deadline are marked **Expired** by an hourly job.
- When the merchant has [limits](/manual/merchants), a transaction over a limit is recorded as **Failed** and the detail screen shows the reason.
- Requests carry an idempotency key, so a retry from the same form never creates a duplicate.

## Transaction detail

Shows the transaction (merchant, product, user, method, applied / completed time, **refund deadline**), the failure reason of a failed transaction, the bank-transfer block (transfer ID, deadline, deposited amount, short / excess) where applicable, the **status history** (when / who / from → to) and refunds.

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
