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

## Details and editing

The detail screen opens in **read-only mode**. Press **Edit** (top right) to switch to the form and **Update** (bottom) to save; the screen returns to read-only afterwards.

- The merchant ID and password cannot be edited.
- **Revealing (eye icon) and regenerating the password** require the master role. In the general role the buttons are disabled and the API answers 403.
- Regenerating invalidates the old password; share the new value with the merchant.

## Enabled payment methods

“Enabled payment methods” and “Transfer ID length” are edited in the **Payment settings** section of the merchant form. The transfer ID length (7 or 8 digits) is the length of the transfer IDs issued for this merchant's bank transfer transactions.

## Tabs

The detail screen has five tabs. **Basic** and **Notifications** open the merchant form via **Edit** (top right); the other tabs carry their own small forms.

| Tab | Contents |
|---|---|
| Basic | Merchant ID, password, site / company / contact, referring agent, enabled payment methods, transfer ID length, contacts |
| Contract & fees | Contract plan and per-method fee rates, effective date, contract history, transfer deadline and refund window |
| Limits | Per-transaction / daily / monthly limits per payment method with today's and this month's usage |
| API keys | API keys the merchant site uses to call the payment API, and signing secrets for notifications |
| Notifications | Notification URL, format, parameter set, identifier and the sample request |

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
