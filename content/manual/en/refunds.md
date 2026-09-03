# Refunds

Review **refund requests** on completed transactions and keep the refund history. A refund goes through two steps, request → approve / reject: any operator can file a request, but only the **master role** decides it.

## Requesting a refund (transaction detail)

Press **Request refund** on a transaction in [Payments](/manual/payments) and fill in:

| Field | Notes |
|---|---|
| Refund amount | Up to the refundable balance (amount − refunded − pending requests). The full amount is recorded as “Full”, anything else as “Partial” |
| Reason | Customer request / Defective product / Duplicate payment / Other (details required for Other) |
| Details | Optional note; required for a forced refund past the deadline |

- Only **Completed / Partially refunded** transactions can be refunded.
- A transaction past the merchant's **refund window** (completion + the days configured on the merchant) cannot be requested. A master may tick “Force the refund” and give a reason; such refunds are flagged “Past deadline (forced)” in the list and the detail.
- Pending requests reserve part of the balance, so the total can never exceed the transaction amount.

## Review (master)

The refund list shows **Requested** rows first. **Approve** on the detail screen applies the refund: the transaction becomes **Partially refunded** or **Refunded** (the demo completes immediately without a processing step). **Reject** declines the request and keeps your review note. Both decisions are written to the [audit log](/manual/admins).

## Filters and CSV

Filter by status (Requested / Approved / Rejected / Processing / Completed / Failed), merchant and request date; the **Test / Live** switch in the header selects the data. **CSV** in the table footer exports the current selection.

## Difference from cancelling

To abandon an authorized transaction before it is captured, use **Cancel** on the transaction detail (Applied / Awaiting transfer / Authorized, master role) instead of a refund. A refund returns money on a completed transaction.
