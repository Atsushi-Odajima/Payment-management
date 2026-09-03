# Reports

KPIs and trends of the transactions in a period, filtered by merchant and payment method, with CSV exports. The **Test / Live** switch in the header selects the data.

## Filters

| Field | Notes |
|---|---|
| Granularity | **Daily** (default: the last 30 days, one bucket per day) / **Monthly** (this year, per month) / **Custom period** (from–to, per day) |
| From / To | Applied date (transaction creation) |
| Merchant / Method | Optional |

## Figures

| Figure | Calculation |
|---|---|
| Applications | Transactions created in the period |
| Completed / completed amount | Transactions that reached Completed, Partially refunded, Refunded or Chargeback (completed at least once) |
| Success rate | Completed ÷ applications |
| Abandon rate | Expired + cancelled ÷ applications |
| Average amount | Completed amount ÷ completed count |
| Refund rate | Refunded amount ÷ completed amount |
| Chargeback rate | Chargebacks opened in the period ÷ completed count |

## Charts

- **Trend** (line): completed amount per bucket; the table below lists applications, completed count and amount.
- **Share by method** (donut): completed amount per payment method.
- **Merchant ranking** (bars): top 10 merchants by completed amount.

## CSV

- **Summary CSV**: one row per bucket (period, applications, completed, amount).
- **Detail CSV**: one row per transaction in the period (created at, transaction ID, order number, merchant, method, status, amount, refunded), capped at 10,000 rows.
