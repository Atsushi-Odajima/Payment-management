# Payment links

Issue a **checkout page URL / QR code** with a fixed product and amount to accept payments without the merchant's own site — for social-media or e-mail sales, or a QR code shown at a counter.

## Issuing a link

**+ Issue link** asks for:

| Field | Description |
|---|---|
| Merchant | Owner of the sale. The methods offered on the checkout page are the merchant's enabled payment methods that have an active provider in the same mode |
| Product / amount / description | Shown on the checkout page. Fixed after issuing (disable and re-issue to change) |
| Expiry | Valid until the end of that day (Japan time). Empty means no expiry |
| Maximum uses | Cap on the number of transactions created. Empty or 0 means unlimited |

The link is created in the mode of the header's test / live switch. The detail screen shows the **URL** (with a copy button) and the **QR code**.

## The checkout page (`/pay/<token>`)

- A public page — no login, no admin navigation.
- The customer picks a method, enters a name (e-mail optional) and presses **Pay**. A transaction is created as **authorized** and the link's use count increases by one.
- For **bank transfer** the page shows the transfer ID and deadline and the transaction becomes **awaiting transfer**; deposits are reconciled from the payment applications list as usual.
- For any other method a demo **Complete payment** button appears; pressing it **completes** the transaction (no card details are collected).
- Disabled, expired and exhausted links say so and accept no payment.

Transactions get the order number `LNK-<first 6 characters of the token>-<sequence>` and are marked "Payment link" in the transaction detail.

## Disabling

**Disable link** on the detail screen stops further use; existing transactions are untouched. Disabling cannot be undone — issue a new link instead.

## Permissions

| Action | Master | General |
|---|---|---|
| View | ○ | ○ |
| Issue / disable | ○ | ○ |

Issuing and disabling are audited (`payment_link.create` / `payment_link.disable`). Transactions created from the checkout page are recorded with the actor "system".
