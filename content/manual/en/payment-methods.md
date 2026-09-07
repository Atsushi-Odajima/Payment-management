# Payment method suspension

Stops **new applications for one payment method** temporarily — during a provider outage or at a merchant's request. In-flight transactions (completion, refunds, deposit reconciliation) are not affected.

## Order of evaluation

1. **Global switch** (Settings → Payment method suspension, admin only)
2. **Merchant switch** (merchant detail → Payment methods tab, admin / cs)
3. The merchant's **enabled payment methods** (basic info)

A method is accepted only when all three allow it. The check lives in the shared transaction-creation path, so the dashboard's "Create payment", the payment-link checkout page, subscription charges, and the merchant API / sandbox (Phase L) all behave the same. Suspended methods disappear from the checkout page and the creation form; an API call naming one answers `409 method_suspended`.

## Suspending and resuming

- Four methods have switches: credit card, QR, konbini and bank transfer ("other" providers have none).
- Flipping a switch to "suspended" opens a modal asking for a **reason (required)** and an optional **automatic resume time**; nothing is suspended without them (global and per-merchant alike). The cron (`/api/cron/payment-method-controls`) resumes the method after that time. Suspended rows show the reason, who suspended it, when, and the planned resume; the merchant portal's "Payment methods" page shows the same.
- Every suspend / resume is audited (`payment_method.suspend` / `payment_method.resume`) and creates a notification (Phase J) — critical for global, warning for merchant switches.
- While a **global** switch is off, a red banner is shown on the dashboard and on every page header.
- After a global suspension you are asked "Draft an incident announcement?"; choosing yes creates an incident draft and opens its edit screen, where you publish it.

## API

| Request | Role | Purpose |
|---|---|---|
| `GET /api/payment-method-controls` | view | The four global switches |
| `GET /api/payment-method-controls?merchantId=<id>` | view | Global plus the merchant's switches |
| `PUT /api/payment-method-controls` `{ scope: "global" | "merchant", merchantId?, method, suspended, reason, resumeAt? }` | global = admin, merchant = admin / cs | Suspend (reason required) / resume |

Creating a transaction with a suspended method answers `409 { code: "method_suspended", details: { scope: "global" | "merchant", method } }`.
