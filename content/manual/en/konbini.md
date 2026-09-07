# Konbini payments

**Konbini payments** issue a **13-digit receipt number** and a **payment deadline** to a customer who chose "convenience store" at checkout, then wait for the payment at the till or the in-store kiosk. Like bank transfers they are one row of the transaction table (`Payment`); no new table is involved.

## Fields

| Field | Description |
|---|---|
| Store | 7-Eleven / Lawson / FamilyMart / Ministop / other, chosen by the customer (or on the dashboard) at creation |
| Receipt number | 13 digits, never starting with 0, unique; shown on the lists, the detail and in global search |
| Payment deadline | **Merchant setting** in days after the application (default 3, 1–30). Shares the column with the bank-transfer deadline |
| Paid at | When the store's payment notification arrived |

## Lifecycle

| State | Meaning | Next |
|---|---|---|
| Awaiting payment (`awaiting_payment`) | Receipt number issued, waiting for the customer. A status of its own, distinct from Pending (`pending`) | Deposit reconciliation / cancel / fail / expire (once overdue) |
| Completed | Paid at the store | Refund / receipt |
| Expired | Not paid by the deadline | A notification that arrives afterwards is held as an unmatched deposit and can be applied with "Apply as late deposit" ([Payment applications](/manual/applications)) |

On the payment-application list, waiting konbini payments share the **same lane as awaiting bank transfers** (nearest deadline first, overdue in red) and carry an "Awaiting payment" badge.

## Payment notification

The store network's notification is received by `POST /api/demo/cvs-notify`, which completes the transaction through the **same `deposit` action as a bank deposit**. A short amount leaves the slip waiting with a "short" flag.

```
POST /api/demo/cvs-notify
Authorization: Bearer <DEPOSIT_NOTIFY_SECRET>
{ "eventId": "cvs-evt-0001", "receiptNo": "4102993827716", "mode": "test" }
```

- Authentication uses the same `DEPOSIT_NOTIFY_SECRET` as the bank notification. Without it the endpoint is open outside production and answers 404 in production
- `mode` (`test` / `live`) is **mandatory**. A notification whose mode differs from the transaction's environment is not reconciled but held as an unmatched deposit (reason "environment mismatch"). A resend with the same `eventId` (optional, up to 128 characters) answers 200 `{ duplicate: true }` and applies nothing. Every notification is kept in the [deposit notification log](/manual/applications)
- Completion sends the merchant a `payment.completed` webhook and the customer a payment-completed e-mail
- The "Mark as paid at the store (demo)" button on the hosted payment page calls the same code

## Expiry and notifications

- The cron job (`/api/cron/expire-transfers`; once a day on the demo's Vercel, hourly recommended in production) turns overdue receipt numbers into **Expired**, exactly like bank transfers. The **Overdue** tab of the application list shows transactions past their deadline that are not expired yet
- The notification centre receives one daily "Overdue konbini payments" (`cvs.overdue`) notification (admin / accounting / cs)

## Customer instructions

- Creation records the **Konbini payment instructions** e-mail template (`cvs_guide`) in the e-mail log (store, receipt number, amount, deadline)
- The hosted payment page lets the customer choose the store and shows the receipt number and deadline after checkout

## Merchant setting

Merchant detail → Contract & fees tab → "Deadlines" has **Konbini payment deadline (days)** (roles: admin / accounting).
