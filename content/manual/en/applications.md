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
| Applied | Just created (e.g. konbini, waiting for payment) | Complete / fail / cancel / expire |
| Awaiting transfer | Bank transfer; transfer ID issued, waiting for the deposit | Reconcile deposit / cancel / expire (once overdue) |
| Authorized | Card authorization held | Complete / fail / cancel |
| Completed | Payment succeeded (moves to Payments) | Refund |
| Failed / Expired / Cancelled | Terminal | none |
| Refunded | Fully refunded (Payments) | none |

Every change is written to the **status history** with the previous and new status, who did it (dashboard / webhook / deposit notification (bank) / seed data) and when.

## Ordering and filters

- **Awaiting transfer** rows come first, nearest deadline on top. **Overdue** transfers are highlighted in red with an “Overdue” badge. Everything else is newest first.
- Filter by payment method, status, merchant, applied-date range (from / to) and test / live.

## Actions (master role)

Actions on the detail screen require an account with the master role; the general role is read-only. The server enforces the check.

| Method | Button | Behavior |
|---|---|---|
| Bank transfer | Reconcile deposit | Enter the amount received. **Exact** → Completed; **short** → stays Awaiting transfer with the “Short” flag (later deposits accumulate); **excess** → Completed with the “Excess” flag |
| Bank transfer | Mark expired | Only for awaiting transfers past their deadline |
| Cards etc. | Mark completed / Mark failed | Manual demo transitions (in production the PSP's notification drives these) |
| All | Cancel | Applied / awaiting transfer / authorized only |

## Deposit notification API (demo)

Simulates the callback a bank sends when money arrives. Send the transfer ID and the amount; the same reconciliation rules run, and the history records the actor as “Deposit notification (bank)”.

```
POST /api/demo/deposit-notify
Authorization: Bearer <DEPOSIT_NOTIFY_SECRET>
Content-Type: application/json

{ "transferId": "48213907", "amount": 24800 }
```

| Field | Meaning |
|---|---|
| `transferId` | Transfer ID (7 or 8 digits) |
| `amount` | Amount received (yen, integer) |

Example response:

```
{ "ok": true, "data": { "transferId": "48213907", "paymentId": "pay_…", "amount": 24800,
  "received": 24800, "depositAmount": 24800, "depositDiff": null, "status": "captured", "completed": true } }
```

| Situation | Response |
|---|---|
| Unknown transfer ID | 404 `transfer_not_found` |
| Not awaiting transfer (already completed, expired…) | 409 `invalid_transition` |
| Short deposit | 200, `status: "awaiting_transfer"`, `depositDiff: "short"` |
| Excess deposit | 200, `status: "captured"`, `depositDiff: "excess"` |

When the `DEPOSIT_NOTIFY_SECRET` environment variable is set, the bearer token is required. Without it the endpoint answers 404 in production and is open in development. Example:

```
curl -X POST http://localhost:3000/api/demo/deposit-notify \
  -H "Content-Type: application/json" \
  -d '{"transferId":"48213907","amount":24800}'
```
