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
