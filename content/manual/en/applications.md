# Payment Applications

A **payment application** is the transaction record created the moment a customer puts items in the cart and picks a payment method on the merchant site (the equivalent of a Stripe PaymentIntent or a GMO transaction registration). This screen is for **tracking transactions before they complete and reconciling deposits**.

Payment applications and payments are the same transaction table split by status.

| Screen | Statuses shown |
|---|---|
| Payment Applications | Applied / Awaiting transfer / Authorized / Failed / Expired / Cancelled |
| Payments | Completed / Partially refunded / Refunded |

## Fields

| Field | Meaning |
|---|---|
| Transaction ID | Unique id issued by the system (`payment_id` in notifications) |
| Order number | The merchant's order number |
| Merchant | The merchant site where the transaction happened |
| Product / amount | Cart contents and the amount due (yen) |
| User name / user ID | The merchant-side customer |
| Payment method | Credit card / QR / konbini / bank transfer / other |
| Applied / completed | When the transaction was created and when it completed |
| Status | See the lifecycle below |

Bank transfers additionally carry a **transfer ID** (7 or 8 digits per merchant, unique), a **transfer deadline** (7 days after application), the **deposited total** and a **short / excess flag**.

## Status lifecycle

| Status | Meaning | Possible next actions |
|---|---|---|
| Pending | Just created (no result from the payment method yet) | Complete / fail / cancel |
| Awaiting transfer | Bank transfer; transfer ID issued, waiting for the deposit | Reconcile deposit / cancel / expire (once overdue) |
| Awaiting payment | Konbini; receipt number issued, waiting for the counter payment | Reconcile deposit (store notification) / cancel / expire (once overdue) |
| Authorized | Card authorization held | Complete / fail / cancel |
| Completed | Payment succeeded (moves to Payments) | Refund |
| Expired | The transfer / payment deadline passed | Apply a late deposit (from the unmatched deposits screen; expired → completed) |
| Failed / Cancelled | Terminal | none |
| Refunded | Fully refunded (Payments) | none |

Every change is written to the **status history** with the previous and new status, who did it (dashboard / webhook / deposit notification (bank) / seed data) and when.

## Ordering and filters

- **Awaiting transfer** rows come first, nearest deadline on top. **Overdue** transfers are highlighted in red with an “Overdue” badge. Everything else is newest first.
- Filter by payment method, status, merchant and applied-date range (from / to). Test / live is selected with the switch in the header.

## Actions (master role)

Actions on the detail screen require an account with the master role; the general role is read-only. The server enforces the check.

| Method | Button | Behavior |
|---|---|---|
| Bank transfer | Reconcile deposit | Enter the amount received. **Exact** → Completed; **short** → stays Awaiting transfer with the “Short” flag (later deposits accumulate); **excess** → Completed with the “Excess” flag |
| Bank transfer | Mark expired | Only for awaiting transfers past their deadline |
| Cards etc. | Mark completed / Mark failed | Manual demo transitions (in production the PSP's notification drives these) |
| All | Cancel | Applied / awaiting transfer / authorized only |

## Deposit notification API (demo)

Simulates the callback a bank sends when money arrives. Send the transfer ID and the amount; the same reconciliation rules run, and the history records the actor as “Deposit notification (bank)”. The konbini network's counter-payment notification is `POST /api/demo/cvs-notify` (`receiptNo` = the 13-digit receipt number) with the same rules.

```
POST /api/demo/deposit-notify
Authorization: Bearer <DEPOSIT_NOTIFY_SECRET>
Content-Type: application/json

{ "eventId": "bank-20260901-0007", "transferId": "48213907", "amount": 24800, "mode": "test" }
```

| Field | Meaning |
|---|---|
| `eventId` | Optional (≤ 128 chars). The sender's event ID. **A notification with an ID seen before is treated as a duplicate and never applied twice** |
| `transferId` | Transfer ID (7 or 8 digits). The konbini notification uses `receiptNo` (13 digits) instead |
| `amount` | Amount received (yen, integer). Optional for konbini (defaults to the slip amount) |
| `mode` | **Required.** `test` or `live`. Missing → 400 `invalid_input` with `fieldErrors.mode = "required"` |
| `payerName` / `bankReference` / `receivedAt` | Optional: payer name, bank reference, deposit time (ISO 8601; defaults to the time of receipt) |

Without an `eventId` the dedupe key is a hash of “source | transfer ID or receipt no. | amount | deposit time (minute) | bank reference”.

Example response:

```
{ "ok": true, "data": { "notificationId": "…", "notificationNo": "DN-00012", "duplicate": false, "matched": true,
  "transferId": "48213907", "paymentId": "pay_…", "amount": 24800, "received": 24800,
  "depositAmount": 24800, "depositDiff": null, "status": "captured", "completed": true } }
```

| Situation | Response |
|---|---|
| Re-sent notification (same `eventId` or hash) | 200, `duplicate: true` (`notificationId` / `paymentId` of the original). Nothing is re-applied |
| Missing or unknown transfer ID | 202, recorded as an unmatched deposit (`matched: false`, `reason: "not_found"`, `unmatchedDepositId`) |
| `mode` differs from the transaction's mode (test / live) | 202, filed as an unmatched deposit (`reason: "mode_mismatch"`, `paymentId`) instead of reconciling. A test notification can never complete a live transaction |
| Transaction expired | 202, unmatched deposit (`reason: "late_deposit"`, `paymentId`); it can be applied as a late deposit (below) |
| Transaction cancelled | 202, unmatched deposit (`reason: "cancelled_deposit"`); dismiss (return) only |
| Completed or otherwise not accepting money | 409 `invalid_transition` (recorded in the log as rejected) |
| Short deposit | 200, `status: "awaiting_transfer"` (`"awaiting_payment"` for konbini), `depositDiff: "short"` |
| Excess deposit | 200, `status: "captured"`, `depositDiff: "excess"` |

When the `DEPOSIT_NOTIFY_SECRET` environment variable is set, the bearer token is required. Without it the endpoint answers 404 in production and is open in development. Example:

```
curl -X POST http://localhost:3000/api/demo/deposit-notify \
  -H "Content-Type: application/json" \
  -d '{"eventId":"bank-20260901-0007","transferId":"48213907","amount":24800,"mode":"test"}'
```

## Following up short / excess deposits

Transactions whose reconciliation left a short or excess deposit appear on **Deposit differences** as “Open”. The follow-up status moves as follows (also shown at the top of that screen).

| Case | Action | Transition |
|---|---|---|
| Short | **Mark top-up requested** (sends and logs the `deposit_short` e-mail) | Open → Top-up requested → (the next deposit is reconciled again and completes) → Resolve |
| Excess | **Request refund of excess** (files a refund request with reason “duplicate payment”; approve it in Refunds) | Open → Refund arranged → Resolve |

Each row links to the refund request and the e-mail log it produced (“Open in refunds” / “View the e-mail sent”). The transaction detail shows the notifications received with the same transfer ID / receipt number and candidate unmatched deposits; in the reconcile dialog, clicking a candidate fills the amount and the result (exact / short / excess) is previewed before confirming.

The **Overdue** tab of the applications list shows transactions still awaiting transfer / payment past their deadline (status unchanged). It is different from the “Expired” status: until the expiry job runs they can still be reconciled or cancelled.

## Deposit notification log

Every notification received (bank / konbini) is recorded on the **Deposit Notification Log** screen (Transactions group, next to Unmatched Deposits) whatever its outcome: notification number (`DN-00001`), source, transfer ID / receipt number, amount, deposit time, result (applied / duplicate / unmatched / rejected) with the reason, and links to the transaction and the unmatched deposit. Filter by source, result and date; CSV export; the header's test / live switch selects the environment.

## Unmatched deposits and API re-notify (bank transfers only)

When a customer **transfers money without the transfer ID**, the deposit notification cannot be tied to a transaction and the purchase is never reflected. This feature lets support attach the transfer ID and have the merchant credited **through the API (webhook) instead of a manual update on the merchant side**. It does not apply to card, QR or other payments that the provider confirms itself.

### Flow

1. **An unmatched deposit appears**: a call to `POST /api/demo/deposit-notify` whose `transferId` is missing (or matches no transaction) is recorded as an *unmatched deposit* with **202** instead of 404. Deposits whose `mode` differs from the transaction's, and deposits on expired or cancelled transactions, are filed the same way; the list shows the reason (mode mismatch / late deposit / cancelled transaction) and the transaction concerned. Support can also register one by hand from **Unmatched deposits → + Register deposit** after reading the bank statement.
2. **Attach the transfer ID (match)**: **Match by transfer ID** on the list (admin / accounting) asks for the ID. The dialog lists the awaiting transfers of the same mode, **exact remaining amounts first**; clicking one fills the field. Transactions of the other mode and expired transactions are shown with the reason but cannot be selected. The normal reconciliation then runs (exact → completed, short → still awaiting with the short flag, excess → completed with the excess flag) and, **as soon as the transaction completes, `payment.completed` is sent to the merchant's notification URL**.
3. **Apply as late deposit**: rows whose reason is “late deposit” (the transaction expired) offer **Apply as late deposit** (admin / accounting, reason required). The transaction moves **expired → completed** (history action “Late deposit applied”), and `payment.completed` plus the completion e-mail go out as usual. A different amount still completes it; the difference is recorded as a short / excess deposit. Deposits on cancelled transactions cannot be applied (dismiss only).
4. **API re-notify**: if the merchant lost the notification, **API re-notify** on the transaction detail (completed / partially refunded / refunded bank transfers only; admin / cs / developer) sends `payment.completed` again. The result is visible in the webhook delivery log, and the transaction keeps the re-notify count and the last time.
5. **Dismiss**: deposits that must not be tied to a transaction (already returned, duplicates) are **dismissed** with a category (**Return arranged** / other) and a reason. Choose “Return arranged” when a late or post-cancellation deposit is being sent back. Open late deposits are reported to the notification centre once a day (“Late deposits awaiting a decision: N”, warning).

| Action | API | Role |
|---|---|---|
| Register an unmatched deposit | `POST /api/unmatched-deposits` `{ amount, payerName, receivedAt?, bankReference?, givenTransferId?, note? }` | ○ |
| Candidates | `GET /api/unmatched-deposits/<id>` → `{ deposit, candidates }` | ○ |
| Match by transfer ID | `POST /api/unmatched-deposits/<id>/match` `{ transferId }` → `{ deposit, payment, renotified }` | M |
| Apply as late deposit | `POST /api/unmatched-deposits/<id>/late-match` `{ reason }` → `{ deposit, payment, renotified }` | M |
| Dismiss | `POST /api/unmatched-deposits/<id>/dismiss` `{ reason, kind? }` (`kind`: `returned` / `other`) | ○ |
| API re-notify | `POST /api/payments/<id>/renotify` → `{ deliveryId, renotifyCount, renotifiedAt }` | M |

Errors: unknown transfer ID / not a bank transfer → 404 `transfer_not_found`, not awaiting transfer → 409 `invalid_transition`, other mode → 409 `mode_mismatch`, deposit already handled → 409 `deposit_not_open`, re-notify on a card payment → 409 `not_bank_transfer`, re-notify on an open transaction → 409 `invalid_transition`. Everything is audited (`deposit.register` / `deposit.match` / `deposit.dismiss` / `payment.renotify`).
