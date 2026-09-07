# Receipts and invoices

PDFs are generated with **pdf-lib** and embed a bundled **Noto Sans JP subset** (JIS X 0208, about 3 MB) for Japanese text. No headless browser is involved, which keeps the functions well inside Vercel's serverless size limits.

## Receipts

A **receipt PDF** can be issued for a completed transaction (Completed / Partially refunded).

| Item | Content |
|---|---|
| Receipt number | `RC-YYYYMM-00001` (sequential per month), assigned on the first issue and kept on re-issues |
| Addressee | Editable at issue time; empty falls back to the customer name |
| Amount | Transaction amount net of refunds (tax included) |
| Description | Editable at issue time; empty falls back to the product name (or the default wording) |
| Issuer | The merchant (company / site / address / registration number) with Wire Pay listed as the payment agent (issuer details from global settings) |
| Re-issue | Counted and stamped "REISSUED" at the top right of the PDF |

### How to issue

1. On the transaction detail (payments list), press **Issue receipt** in the "Receipt" card (roles: admin / accounting / cs)
2. Confirm the addressee; the number is assigned and `receipt.issue` is written to the audit log
3. **Open PDF** shows the document from `GET /api/payments/<id>/receipt` (login required)

Merchants can also issue or re-issue receipts from the **merchant portal transaction detail** (completed / partially refunded transactions only) with an addressee and a description (`POST /api/merchant-portal/receipts/<transaction id>`, `source = merchant`, audited with the merchant as actor). The receipt number and re-issue count are the same row the operator sees; the dashboard's receipt card notes "Issued from the merchant portal".

### Customer download

After completing a payment on the hosted payment page, the customer sees a **signed receipt download link** (valid 30 days). It is independent of the admin session and resolves that one transaction only. The first download creates the receipt row (`source = customer`); later downloads do not count as re-issues.

## Invoices (qualified invoices)

A **qualified invoice PDF** from the PSP to the merchant covers the **settlement fees** of a batch.

| Item | Content |
|---|---|
| Availability | Confirmed batches or later (collecting → 409). Roles: admin / accounting |
| Invoice number | `INV-YYYYMM-<merchant number>-<2-digit sequence>` (month the period starts; the merchant's confirmation order within that month). **Assigned and stored when the batch is confirmed**; the PDF prints the stored value (an unnumbered batch answers 409 `invoice_no_missing`; see [Settlements](/manual/settlements)) |
| Issuer | Global settings: name / registration number (T + 13 digits) / address / phone |
| Recipient | The merchant's company name / address / registration number (settlement tab) |
| Lines | Fees per payment method (count, sales base, tax category, tax-inclusive amount) plus the transfer fee |
| Breakdown by tax rate | Tax-exclusive amount, tax and tax-inclusive amount per 10% / 8% (reduced) / N/A |

### Consumption tax

- Line fees are **tax-inclusive** (the settlement's net payout already deducted them in full, so no tax is added on top)
- Each line carries a tax category (`taxCategory`): payment fees are 10%, refund and chargeback lines are not applicable
- Tax is computed **per rate** and rounded to the yen with the **consumption-tax rounding** in global settings (default floor; round / ceil available)
- Every export is written to the audit log as `settlement.invoice_export`

### Where to configure

- Global settings (admin): issuer name, registration number, address, phone, rounding
- Merchant detail → Settlement tab (admin / accounting): the merchant's registration number and address
