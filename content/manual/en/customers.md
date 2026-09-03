# Customers and personal data

**Customers** covers the customer master per merchant (`Customer`) and stored card references (`PaymentToken`), together with the dashboard-wide rules for **masking personal data, auditing reveals and anonymising by retention**.

## Customer master

| Item | Description |
|---|---|
| Customer id | The merchant's customer id (the transaction's "customer id"); one row per merchant × id |
| Name / e-mail / phone | Created and refreshed from transactions (phone is for API / merchant-side registration) |
| Stored cards | Cards used in transactions (brand, last 4, expiry, fraud hash). The card number itself is never stored |
| Transactions | Transactions linked to the customer (`Payment.customerRef`) |
| Anonymised | Personal data cleared by retention or a manual master action |

- Transactions link to customers by merchant id + customer id whichever way they are created (`POST /api/payments`, payment links, subscriptions, the public API)
- Existing transactions are linked by an **idempotent backfill** at seed time (and `npm run db:link-customers`)
- Global search (Ctrl+K) covers customers (id, name, e-mail)

## Masking

Operator (PSP) screens show personal data as:

| Kind | Shown as |
|---|---|
| Name | Family name only (`Yamada ＊＊`) |
| E-mail | First 2 characters + `***@domain` (`ta***@example.com`) |
| Phone | Last 4 digits (`***-****-5678`) |
| Source IP | 4th octet hidden (`203.0.113.***`) |

- Applies to transaction lists / details, subscriptions, unmatched deposits, e-mail logs, global search, the customer list and the before / after snapshots of the audit log (**masked at write time**)
- **Unmask** (admin / cs): the "Unmask" control on a detail screen reveals the real value; each reveal writes `pii.unmask` (target and fields) to the audit log
- **CSV exports**: with the global setting "personal data in CSV" on "Masked" every role gets masked values; on "Full" admin / accounting get real values
- The **merchant portal** shows the merchant's own customers unmasked (it is their data)

## Retention and anonymisation

- Customers whose last transaction is older than the **personal data retention (months, default 24)** in global settings are anonymised by the daily job (`/api/cron/anonymize`, 04:00 JST): name, e-mail and phone are cleared, the linked transactions lose name, e-mail, source IP and card identifiers, and stored card tokens are deleted. Ledger data (amounts, statuses) stays
- Old transactions without a customer row (no merchant or customer id) are scrubbed by the same rule
- Each run is recorded as an **anonymisation batch** (Customers → runs tab), in the audit log (`pii.anonymize_batch`) and in the notification centre (`pii.anonymized`, admin)
- Audit rows older than the **audit log retention (years, default 7)** are deleted by the same job and recorded as `audit_log.prune`
- **Manual anonymisation** (admin): "Anonymise" on the customer detail with a reason; `pii.anonymize` keeps the reason. Cannot be undone. A customer who transacts again gets fresh data and a new retention window

## Permissions

| Action | Roles |
|---|---|
| View customers (masked) | everyone |
| Unmask | admin / cs |
| Manual anonymisation | admin |
| Retention / CSV settings | admin (global settings) |
