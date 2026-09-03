# Getting started

Wire Pay's public API (v1) lets your storefront **create and retrieve transactions, request refunds and issue payment links**. Requests and responses are JSON; amounts are whole yen (JPY has no minor unit).

## Basics

| Item | Value |
|---|---|
| Base URL | `https://<your-host>/api/v1` |
| Authentication | `Authorization: Bearer wp_test_ak_…` or `wp_live_ak_…` |
| Environments | The key decides **test / live**; the endpoints are the same |
| Response format | Success `{ "ok": true, "data": … }` / failure `{ "ok": false, "error": { "code", "message" } }` |
| Idempotency | `Idempotency-Key` header (8–128 chars); a retry with the same key returns the same transaction |
| Rate limit | 60 requests per minute per merchant and environment (429 beyond that) |
| OpenAPI | `GET /api/v1/openapi.json` |

## Payment flow

1. `POST /transactions` creates the transaction. Depending on `method`, credit / QR complete immediately (`captured`) or stay authorized (`authorized`), konbini returns a receipt number (`konbini.receiptNo`), bank transfer a transfer id (`bankTransfer.transferId`) and deadline.
2. Konbini and bank transfers complete once the customer pays. Completion sends a **webhook** (`payment.completed`) to your notification URL; `GET /transactions/{id}` shows the state too.
3. When a refund is needed, request it with `POST /refunds`. Wire Pay approves it and sends `refund.completed`.

## Minimal example

```
curl -X POST https://<your-host>/api/v1/transactions \
  -H 'Authorization: Bearer wp_test_ak_…' \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: order-2026-00042' \
  -d '{ "method": "credit", "orderNumber": "ORD-2026-00042", "amount": 4980, "customerEmail": "taro@example.com", "card": { "number": "4242424242424242", "expMonth": 12, "expYear": 2028 } }'
```

`data.status` of `captured` means the payment completed.

## Merchant portal

Transactions, refunds, the webhook log, settlements and API keys are also available in the [merchant portal](/merchant/login). See "Authentication and environments" for test keys and live keys.
