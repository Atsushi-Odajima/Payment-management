# Settlements

Per merchant, a settlement batch turns the sales of a period minus fees, refunds, chargebacks and the transfer fee into a **net payout** and tracks it until it is paid.

## Settlement settings (merchant detail → “Settlement” tab)

| Field | Notes |
|---|---|
| Settlement cycle | Monthly / twice a month (15th and month end) / weekly. Sets the default batch period |
| Payout term | End of next month / 15th of next month / 15th of the month after next / next week. The payout date is computed from the period end |
| Bank account | Bank, branch, account type (ordinary / current), account number (7–8 digits), holder. Dummy values are fine in the demo |
| Settlement fee | Fee deducted from every payout (yen) |

Changes are written to the audit log.

## Generating a batch

Pick a merchant and a period in the form at the top of Settlements and press **Generate**: **completed transactions** of the period (fees use the contract rates in force when each completed), **completed refunds** and **confirmed chargebacks** are aggregated into one batch with lines. The default period is the merchant's most recent closed cycle. Only one batch may exist per merchant, period and mode.

- Production would run this per settlement cycle; the demo generates on demand.
- The **Test / Live** switch in the header selects the data. Test-mode transactions are never settled in production; test batches exist for the demo.

## Statuses and actions (master role)

| Status | Meaning | Actions |
|---|---|---|
| Collecting | Just generated; review the lines | Confirm / Discard batch |
| Confirmed | Amounts fixed; lines can no longer change | Mark scheduled / Hold |
| Scheduled | Payout planned for the scheduled date | Mark paid / Hold |
| Paid | Payout done | — |
| Held | Payout stopped (e.g. chargeback dispute); reason required | Release hold (back to Confirmed) |

Every action follows the transition table and is audited.

## Detail and line CSV

The batch detail shows the breakdown (gross sales, fees, refunds, chargebacks, settlement fee, net payout) and the lines (occurred at, kind, order, method, amount, fee). **Lines CSV** exports the lines; **CSV** in the list footer exports the batch summary.

## Merchant-side access

A merchant calls `GET /api/merchant-api/settlements` with its own Bearer API key to list its batches, and `?id=<batch id>` to fetch one batch with its lines. Only batches of the key's mode (test / live) are returned.
