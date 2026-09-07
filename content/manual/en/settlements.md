# Settlements

For each merchant, the **net payout** of a period — sales minus fees, refunds, chargebacks and the settlement fee — is managed as a settlement batch.

## Settlement settings (merchant detail → Settlement tab)

| Field | Description |
|---|---|
| Settlement cycle | Monthly / semi-monthly (15th and month end) / weekly. Sets the default period of a batch |
| Payout term | Next month end / 15th of next month / 15th of the month after next / next week. The planned payout date is derived from the period end |
| Bank account | Bank, branch, account type (ordinary / current), account number (7–8 digits), holder. Dummy values are fine in the demo |
| Settlement fee | Fee deducted once per payout (JPY) |

Changes are audited (`merchant.settlement_update`).

## Cycles and periods

Every boundary is **midnight in Japan (Asia/Tokyo)**, independent of the server's time zone. The generation form defaults to the most recent closed period.

| Cycle | Default period (relative to the generation date) | Example (generated on 3 Sep) |
|---|---|---|
| Monthly | 1st to last day of the previous month | 1–31 Aug |
| Semi-monthly | 1st–15th of this month when generating on the 16th or later, otherwise 16th–end of the previous month | 16–31 Aug |
| Weekly | Monday–Sunday of the previous week | 24–30 Aug |

Any period can be entered (start ≤ end). Internally the day after the end date is the **exclusive end**; only one batch may exist per merchant, mode, start and end (a duplicate is refused with 409).

| Payout term | Planned payout date (from the period end) |
|---|---|
| Next month end | Last day of the following month |
| 15th of next month | 15th of the following month |
| 15th of the month after next | 15th of the month after next |
| Next week | 7 days after the period end |

## Generating a batch and the arithmetic

**Generate** on the settlements screen collects the following lines for the merchant and period:

| Kind | Source | Date used | Amount | Fee |
|---|---|---|---|---|
| Sale | Transactions with status completed / partially refunded / refunded / chargeback | completion time (`capturedAt`) | transaction amount (+) | formula below |
| Refund | Completed refund requests | completion time (`completedAt`) | refund amount (−) | 0 |
| Chargeback | Lost / confirmed chargebacks | resolution time (`resolvedAt`) | disputed amount (−) | 0 |

- **Fee** = `floor(amount × rate% ÷ 100) + fixed fee` per transaction (rounded down to the yen). The rate is the per-method value of the **contract in force at the completion time** (the newest schedule in the Contract & fees history whose effective date ≤ completion time). Without a contract, or for the "other" method, the fee is 0.
- **Totals**: gross = sum of sale lines, fees = sum of sale-line fees, refunds / chargebacks = sums of their absolute values, settlement fee = the merchant setting (once per batch). **Net payout = gross − fees − refunds − chargebacks − settlement fee**.
- Refunds and chargebacks are deducted in the batch of the period **in which they occurred**, whatever period the original sale belonged to. The net payout can be negative.
- In production this would run automatically per cycle; the demo generates batches manually. The header's **test / live** switch selects the data. Live operation never settles test-mode transactions (test batches exist for the demo).

## Statuses and actions (master)

| Status | Meaning | Actions |
|---|---|---|
| Collecting | Just generated; lines are being reviewed | Confirm / Discard |
| Confirmed | Amounts fixed; lines can no longer change | Schedule payout / Hold |
| Scheduled | To be paid on the planned date | Mark paid / Hold |
| Paid | Payout done | — |
| Held | Payout stopped (reason required), e.g. during a chargeback dispute | Release (back to confirmed) |

Every action follows the transition table and is audited (`settlement.generate / confirm / schedule / pay / hold / release / delete`). Only collecting batches can be discarded. Agent fees count **confirmed / scheduled / paid** batches only ([Agent fees](/manual/agent-fees)).

## Detail and line CSV

The batch detail shows the invoice number, the breakdown (gross, fees, refunds, chargebacks, settlement fee, net payout), a **tax breakdown** under the fee total (excl. tax / tax / incl. tax per rate with the rounding method — the same calculation as the invoice PDF) and the lines (time, kind, order number linked to the transaction, method, amount, fee, tax category).

The **invoice number** is assigned on confirmation as `INV-YYYYMM-<merchant no.>-<2-digit sequence>` (year-month of the period start; the sequence restarts at 01 per merchant and month) and never changes afterwards. It appears on the list, the detail, the invoice PDF, the merchant portal and the merchant API response (`invoiceNo`), and the global search finds batches by it. Collecting batches have no number yet; batches confirmed before the column existed get one from `npm run db:backfill`. **Line CSV** (`/api/settlements/<id>/lines?format=csv`) exports the lines; the **CSV** button of the list exports the batches.

## Merchant access (merchant API)

A merchant calls the following with its API key (`Authorization: Bearer wp_<test|live>_ak_…`). Only batches of the key's mode are returned.

| Request | Response `data` |
|---|---|
| `GET /api/merchant-api/settlements` | `{ merchantCode, mode, settlements: [ { id, periodFrom, periodTo, status, grossAmount, feeAmount, refundAmount, chargebackAmount, settlementFee, netAmount, scheduledAt, paidAt, holdReason, createdAt } ] }` (newest 100) |
| `GET /api/merchant-api/settlements?id=<batch id>` | `{ batch: one entry as above, lines: [ { kind, method, description, amount, fee, occurredAt } ] }`. Another merchant's batch or another mode is 404 |

Times are ISO 8601 / UTC and amounts are integer yen. Authentication details are in the "Merchant API reference" of [Merchant management](/manual/merchants).
