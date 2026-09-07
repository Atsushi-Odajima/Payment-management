# Merchants

Issue and manage accounts for merchants (e-commerce site operators).

## List

Shows merchant ID, site, company, contact, agent, email notification setting and registration date. Click a row to open the details. Pages hold 20 rows.

## Adding a merchant

Use **+ Add Merchant** in the header.

| Field | Notes |
|---|---|
| Merchant ID | Auto-numbered `MER-00001`; cannot be edited |
| Merchant password | Generated on save and stored encrypted; always shown as `********` |
| Site name / katakana | The katakana field accepts **full-width katakana only** |
| Company / contact | Required |
| Referring agent | Optional; pick from the agents registered in Agent management |
| Email / statement email | Format-validated; “Same as email address” copies the value |
| Notification URL | The merchant endpoint that receives payment results. **https only** |
| Notification settings | Format / parameter set / payment identifier (see “Notification spec”) |
| Email notifications | Every payment / daily digest / none |

“Create merchant” stays disabled until every required field is filled. Validation errors appear under the field and the first one is scrolled into view.

On success a **test signing secret** is issued automatically and shown **once**, in plain text, on the completion screen (like an API key: it cannot be shown again once you leave; reissue or rotate it from the API keys tab). Issue the live signing secret from the API keys tab. Webhooks for a mode without a signing secret are not sent ([Webhook deliveries](/manual/webhooks)).

## Details and editing

The detail screen opens in **read-only mode**. Press **Edit** (top right) to switch to the form and **Update** (bottom) to save; the screen returns to read-only afterwards.

- The merchant ID and password cannot be edited.
- **Revealing (eye icon) and regenerating the password** require the master role. In the general role the buttons are disabled and the API answers 403.
- Regenerating invalidates the old password; share the new value with the merchant.

## Enabled payment methods

“Enabled payment methods” and “Transfer ID length” are edited in the **Payment settings** section of the merchant form. The transfer ID length (7 or 8 digits) is the length of the transfer IDs issued for this merchant's bank transfer transactions.

## Tabs

The detail screen has seven tabs. **Basic** and **Notifications** open the merchant form via **Edit** (top right); the other tabs carry their own small forms.

| Tab | Contents |
|---|---|
| Basic | Merchant ID, password, site / company / contact, referring agent, enabled payment methods, transfer ID length, contacts |
| Contract & fees | Contract plan and per-method fee rates, effective date, contract history, transfer deadline and refund window |
| Limits | Per-transaction / daily / monthly limits per payment method with today's and this month's usage |
| API keys | API keys the merchant site uses to call the payment API, and signing secrets for notifications |
| Notifications | Notification URL, format, parameter set, identifier and the sample request |
| Settlement | Settlement cycle, payout term, bank account, settlement fee and this merchant's batches ([Settlements](/manual/settlements)) |
| Webhook log | Recent notifications sent to this merchant and their results ([Webhook delivery log](/manual/webhooks)) |

## Contract & fees

| Field | Notes |
|---|---|
| Contract plan | **Standard** / **Premium** come with built-in rates; **Custom** takes a rate (%, two decimals) and a fixed fee (¥ per transaction) per method (credit / QR / konbini / bank transfer) |
| Effective from | The new rates apply from 0:00 (Japan time) on that date. A future date registers the contract as **Upcoming** while the current one stays in force |
| Contract history | Earlier contracts are kept as history and labelled Current / Upcoming / Ended |
| Transfer deadline (days) | Days from a bank-transfer application to its deadline (1–60, default 7). Applies to **newly created** transactions |
| Refund window (days) | Refunds are allowed within this many days after completion (0–365, default 180). Shown on the transaction detail as the **refund deadline** |

Every contract registration and deadline change is written to the [audit log](/manual/admins) with the before / after values.

## Limits

Set a **per-transaction**, **daily** and **monthly** ceiling per payment method (blank = unlimited). The cards above the form show today's and this month's volume and how much of each limit is used, for the selected mode (test / live).

A transaction over a limit is recorded as **Failed** when the merchant site applies for it; the detail screen shows the reason (“Per-transaction / Daily / Monthly limit exceeded”) and the lists show a “Limit exceeded” badge. Failed, cancelled and expired transactions do not count towards the limits.

## API keys

| Field | Notes |
|---|---|
| Mode | **Test** / **Live**; the prefix (`wp_test_…` / `wp_live_…`) tells them apart |
| Kind | **API key** (Bearer token the merchant site sends to the payment API) / **Signing secret** (shared key used to verify notification signatures) |
| Issue | The plaintext is shown **once**, right after issuing. Only a SHA-256 hash is stored, so it cannot be displayed again |
| Rotate | Issues a replacement with the same mode, kind and label; the old key keeps working during the **grace period** (default 7 days, 0–90) and then becomes **Expired** automatically |
| Revoke | Disables the key immediately. A revoked key cannot be rotated |
| Last used | When the merchant API last accepted the key |

Use `GET /api/merchant-api/ping` as a connectivity check: called with `Authorization: Bearer <API key>` it returns the merchant ID, mode and status, and it honours the merchant's own [IP restrictions](/manual/ip-restrictions) (merchant API, Block).

## Test / live switch

The **Test / Live** switch in the header selects the data mode used by Payments, Payment Applications, the dashboard and the limit usage cards (the choice is stored in a cookie). Each transaction snapshots its provider's mode when it is created, so live transactions never appear in test mode.

## Merchant API reference

Common rules of the **merchant API** (`/api/merchant-api/*`) that a merchant's site calls. No dashboard session is involved; requests are authenticated with an API key.

| Item | Detail |
|---|---|
| Authentication | `Authorization: Bearer wp_<test or live>_ak_<32 chars>` (an API key; signing secrets `wp_…_ss_…` are for webhook verification only and are refused here) |
| Key check | Looked up by SHA-256 hash; revoked and expired keys (end of the rotation grace period) are refused. A successful call stamps "last used" |
| Mode | The key's mode (test / live) is the mode of the returned data |
| IP restrictions | Requests matching the merchant's own [IP restriction](/manual/ip-restrictions) rules (target = merchant API, block) are refused |
| Response shape | Success `{ "ok": true, "data": … }` / failure `{ "ok": false, "error": { "code", "message" } }`. `message` follows the `Accept-Language` or `x-lang` header |
| Rate limit | None on `/api/merchant-api/*` (the public API `/api/v1` allows 60 requests / minute per merchant and environment; 429 `rate_limited` beyond that) |

| Error | HTTP | Meaning |
|---|---|---|
| `invalid_api_key` | 401 | Header missing, malformed, unknown, revoked or expired |
| `ip_blocked` | 403 | Matched a block rule for the merchant API |
| `not_found` | 404 | Another merchant's resource, another mode, or an unknown ID |

| Endpoint | Purpose | Response `data` |
|---|---|---|
| `GET /api/merchant-api/ping` | Connectivity / key check | `{ merchantCode, siteName, mode, kind, keyPrefix, status }` |
| `GET /api/merchant-api/settlements[?id=]` | Settlement batches / lines ([Settlements](/manual/settlements)) | list: `{ merchantCode, mode, settlements: [...] }` / one: `{ batch, lines }` |
| `GET /api/merchant-api/announcements` | Announcements addressed to the merchant ([Announcements](/manual/announcements)) | `{ merchantCode, announcements: [ { id, kind, title, body, publishFrom, publishUntil, updates } ] }` |

```
curl https://<host>/api/merchant-api/ping \
  -H 'Authorization: Bearer wp_test_ak_KotoriDemoTestKey000000000000001'
```

The seeded merchant `MER-00001` already has that test key. Checkouts from the merchant's site use the same key against the **public API v1** (`POST /api/v1/transactions`, see [Public API and API docs](/manual/public-api)). The dashboard's "Create payment" and `POST /api/payments` (admin session) are operator-side tools.
