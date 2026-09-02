# Notification Spec

When a payment result is final, Wire Pay sends a request to the merchant's **notification URL**. Three per-merchant settings determine what is sent. The merchant add / detail screens show a **live sample of the exact request**.

## 1. Notification format (transport)

| Setting | Method | Content-Type | Where parameters go |
|---|---|---|---|
| JSON (POST) | POST | `application/json` | JSON body |
| form-urlencoded (POST) | POST | `application/x-www-form-urlencoded` | body |
| Query parameters (GET) | GET | none | URL query string |

## 2. Parameter set (cumulative)

| Set | Parameters |
|---|---|
| Minimal | `merchant_id`, `amount`, `currency`, `paid_at`, `status` + identifiers |
| Standard | Minimal + `payment_method`, `user_id`, `product_id` |
| Full | Standard + `domain`, `transaction_id` (always, regardless of the identifier setting) |

## 3. Payment identifier

| Setting | Identifiers included |
|---|---|
| Unique payment ID only | `payment_id` |
| Transaction ID only | `transaction_id` |
| Both | `payment_id`, `transaction_id` |

## Parameters

| Name | Type | Description |
|---|---|---|
| `payment_id` | string | Unique payment ID issued by Wire Pay (e.g. `pay_01J9X4M8K2Q7Z3T6`) |
| `transaction_id` | string | Transaction ID on the PSP side |
| `merchant_id` | string | Merchant ID (`MER-00001`) |
| `amount` | integer | Amount in yen. A number in JSON, a string otherwise |
| `currency` | string | Currency code, always `JPY` |
| `paid_at` | string | Payment time, ISO 8601 in JST (`2026-09-01T12:34:56+09:00`) |
| `status` | string | `captured` / `refunded` / `partially_refunded` / `cancelled` / `failed` |
| `payment_method` | string | `credit` / `qr` / `konbini` / `bank` / `other` |
| `user_id` | string | Merchant-side user ID (passed when the payment was created) |
| `product_id` | string | Product ID (passed when the payment was created) |
| `domain` | string | Domain of the site where the payment happened |

## Headers

| Header | Value |
|---|---|
| `Wirepay-Signature` | `t=<unix seconds>,v1=<signature>` (see below) |
| `User-Agent` | `WirePay-Notify/1.0` |

## Verifying the signature

`v1` is an **HMAC-SHA256** keyed with the **merchant password**.

```
signed_payload = "<t>." + <request body>     # for GET: the query string without the leading ?
v1 = hex( HMAC_SHA256( key = merchant password, message = signed_payload ) )
```

On the receiving side:

1. Read `t` and `v1` from the header.
2. Recompute `v1` the same way and compare in constant time.
3. Reject if `t` differs from the current time by **more than 5 minutes** (replay protection).

## Retries and idempotency

- On a non-2xx response or no response within 10 s, delivery is retried **up to 5 times** with exponential backoff.
- A notification for the same `payment_id` (or `transaction_id`) **may arrive more than once**; process it idempotently.

## Sample (JSON / Standard / unique payment ID only)

```
POST https://shop.example.jp/wirepay/notify
Content-Type: application/json
Wirepay-Signature: t=1756697696,v1=3f0c9c5d...
User-Agent: WirePay-Notify/1.0

{
  "payment_id": "pay_01J9X4M8K2Q7Z3T6",
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
