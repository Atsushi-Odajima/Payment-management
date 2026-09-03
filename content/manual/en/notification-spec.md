# Notification parameter specification

Whenever a transaction, refund, chargeback or subscription changes state, Wire Pay sends a request (webhook) to the merchant's **notification URL**. Three per-merchant settings decide what is sent. The merchant add / detail screens (Notifications tab) show a **live sample of the exact request**. Delivery records and resends are covered in [Webhook delivery log](/manual/webhooks).

## 1. Format (transport)

| Setting | Method | Content-Type | Where the parameters go | Signed payload |
|---|---|---|---|---|
| JSON (POST) | POST | `application/json` | JSON body (`amount` is a number, everything else a string) | the raw request body |
| form-urlencoded (POST) | POST | `application/x-www-form-urlencoded` | body | the raw request body |
| Query parameters (GET) | GET | none | URL query string | the query string without the leading `?` |

## 2. Parameter set (cumulative)

| Set | Parameters |
|---|---|
| Minimal | identifiers + `event`, `merchant_id`, `amount`, `currency`, `paid_at`, `status` |
| Standard | Minimal + `payment_method`, `user_id`, `product_id` |
| Full | Standard + `domain`, `transaction_id` (regardless of the identifier setting) |

## 3. Identifier format

| Setting | Identifiers included |
|---|---|
| Unique payment ID only | `payment_id` |
| Transaction ID only | `transaction_id` |
| Both | `payment_id`, `transaction_id` |

## Parameters

The order is fixed: identifiers → minimal → standard → full. Because the order matters for form / query signatures, receivers must sign **the body / query string exactly as received**, not a re-serialised copy.

| Name | Type | Description |
|---|---|---|
| `payment_id` | string | Wire Pay's unique transaction ID (e.g. `pay_01J9X4M8K2Q7Z3T6`) |
| `transaction_id` | string | The PSP-side transaction ID; empty when not available yet |
| `event` | string | Event name (table below). Branch on this first |
| `merchant_id` | string | Merchant ID (`MER-00001`) |
| `amount` | integer | Amount in yen. Number in JSON, string otherwise. Refund / chargeback notifications still carry the **transaction** amount |
| `currency` | string | Always `JPY` |
| `paid_at` | string | Completion time (last update for open transactions). ISO 8601 / UTC (`2026-09-01T03:34:56.000Z`) |
| `status` | string | See the table below |
| `payment_method` | string | `credit` / `qr` / `convenience` / `bank` / `other` |
| `user_id` | string | The merchant's customer ID (`customerId` at creation; for payment links the e-mail or `guest_…`) |
| `product_id` | string | Product name / ID (`productName` at creation) |
| `domain` | string | Host name of the notification URL |

### Events and `status` values

| `event` | When | `status` |
|---|---|---|
| `payment.completed` | The transaction completed (manual capture, payment-link completion, exact / excess deposit, auto-capture from the merchant site) | `captured` |
| `payment.failed` | The transaction failed | `failed` |
| `payment.expired` | Expired after the transfer deadline (including the hourly job) | `expired` |
| `payment.cancelled` | The transaction was cancelled (voided) | `cancelled` |
| `refund.completed` | A refund was approved and completed (including the legacy direct refund API) | `partially_refunded` / `refunded` |
| `limit.exceeded` | A transaction was recorded as failed because a merchant limit was exceeded | `failed:limit_exceeded:<per_transaction / daily / monthly>` |
| `chargeback.opened` | A chargeback was registered | the transaction's current status |
| `subscription.charged` | A subscription charge succeeded (`payment_id` is the charge transaction) | `captured` |
| `subscription.payment_failed` | A subscription charge failed and a retry is scheduled | `past_due` |
| `subscription.suspended` | The third failure suspended the subscription | `suspended` |

## Headers

| Header | Content |
|---|---|
| `X-Timestamp` | Send time (UNIX seconds, as a string) |
| `X-Signature` | `v1=<signature (64 hex characters)>` |
| `Wirepay-Signature` | Compatibility: `t=<X-Timestamp>,v1=<same signature>` for receivers written against the first spec |
| `Content-Type` | POST only (see above) |
| `User-Agent` | `WirePay-Notify/1.0` |

## Verifying the signature

```
signed_payload = "<X-Timestamp>" + "." + <signed payload>     # body, or the query string for GET
v1 = hex( HMAC_SHA256( key = signing key, message = signed_payload ) )
```

The **signing key** is chosen in this order:

1. The merchant's **signing secret** (issued on the merchant detail → API keys tab, `wp_<test|live>_ss_…`): the newest one in the same mode (test / live) that is neither revoked nor expired
2. The **merchant password** when the merchant has no signing secret

Receiver steps:

1. Read `X-Timestamp` and the `v1` value of `X-Signature`.
2. Recompute `v1` over the **raw** body (or query string) without parsing it, and compare in **constant time**.
3. Reject when `X-Timestamp` is more than **5 minutes** away from the current time (replay protection).
4. On success, branch on `event` and `payment_id` and answer **2xx**.

Node.js example:

```js
import { createHmac, timingSafeEqual } from "node:crypto";

export function verify(req, rawBody, secret) {
  const ts = req.headers["x-timestamp"];
  const v1 = String(req.headers["x-signature"] ?? "").replace(/^v1=/, "");
  if (!ts || !v1 || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex");
  return expected.length === v1.length && timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}
```

## Retries and idempotency

- A non-2xx response, or no response within **10 seconds**, is recorded as a failure and retried after **1 min → 5 min → 30 min → 2 h → 24 h**, five attempts at most. After the fifth failure the delivery is abandoned and can be resent manually from the dashboard.
- The same `payment_id` + `event` **may arrive more than once** (retries, manual resends). Process notifications idempotently.
- One transaction produces several events over time (e.g. `payment.completed` → `refund.completed`). Ordering is not guaranteed; decide from your own state and `event`, not from `paid_at` / `status`.

## Sample (JSON / standard / unique payment ID only)

```
POST https://shop.example.jp/wirepay/notify
Content-Type: application/json
X-Timestamp: 1756697696
X-Signature: v1=3f0c9c5d...
Wirepay-Signature: t=1756697696,v1=3f0c9c5d...
User-Agent: WirePay-Notify/1.0

{
  "payment_id": "pay_01J9X4M8K2Q7Z3T6",
  "event": "payment.completed",
  "merchant_id": "MER-00001",
  "amount": 4980,
  "currency": "JPY",
  "paid_at": "2026-09-01T12:34:56+09:00",
  "status": "captured",
  "payment_method": "credit",
  "user_id": "user_10293",
  "product_id": "SKU-2026-0042"
}
```

In the demo the seeded merchants point at `/api/demo/webhook-receiver`; `?result=ok|error|timeout` switches its answer so the retry behaviour can be observed.
