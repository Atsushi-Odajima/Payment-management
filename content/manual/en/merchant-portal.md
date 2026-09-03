# Merchant portal

The screens (`/merchant`) where a merchant reviews its own transactions and settlements. It runs on a **completely separate login and cookie (`wirepay.merchant`) from the operator (PSP) session**, and a merchant only ever sees its own data.

## Login

- URL: `/merchant/login`. Merchant ID (`MER-00001`) plus the password issued at registration (the one the master role can reveal / regenerate on the merchant detail)
- **Five consecutive failures lock the account for 15 minutes** (423). Lockouts and successful logins are audited as `merchant.lockout` / `merchant.login` (actor "Merchant")
- Sessions last 12 hours. The login endpoint shares the operator login's rate limit (10 per minute per IP)
- On the demo, `DEMO_LOGIN_HINT` shows the seeded merchants and passwords on the login screen

## Menu

| Screen | Content |
|---|---|
| Home | Completed today, awaiting payment, refunds under review, failed webhooks, next payout, recent transactions, announcements |
| Transactions | The merchant's transactions and details (no internal notes). The detail offers a **refund request**, which reaches the dashboard's refund screen as "requested" |
| Refund requests | Requests and their decisions (rejection notes included) |
| Webhook log | Deliveries to the notification URL; failed ones can be **re-sent** (audit `webhook.resend`, actor merchant) |
| Settlements | Batches, breakdown and lines; confirmed batches offer the **invoice PDF** |
| API keys | Issued keys; **test keys can be rotated by the merchant** (live keys are read-only, ask the PSP) |
| Payment methods | Methods enabled by the contract and global / per-merchant suspensions with reason and resume time |
| Announcements | Published notices, maintenance and incidents (merchant targeting applied) |
| Sandbox | A console that calls the real public API with a test key |

The test / live toggle in the header selects the environment (the same `wirepay.mode` cookie as the dashboard).

## Implementation notes (for operators)

- The portal's own API lives under `/api/merchant-portal/*`; the middleware verifies the merchant cookie instead of the operator session, with the same CSRF rules as the dashboard
- Everything a merchant does (refund request, resend, key rotation, invoice export) is audited with **actor type "Merchant"** and the merchant id
- Regenerating a merchant's password makes only the new password valid from then on (existing sessions last until they expire)
