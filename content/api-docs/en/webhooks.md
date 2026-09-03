# Webhooks

When a transaction changes state, Wire Pay sends an HTTP request to the merchant's **notification URL**. The format (JSON POST / form POST / query GET), the parameter set and the identifier type follow the merchant settings.

## Events

| Event | When |
|---|---|
| `payment.completed` | Payment completed (card capture, konbini / bank transfer deposit confirmed) |
| `payment.failed` / `payment.expired` / `payment.cancelled` | Failure, expiry, cancellation |
| `refund.completed` | A refund request was approved and completed |
| `chargeback.opened` | A chargeback was registered |
| `limit.exceeded` | A transaction failed because of a merchant limit |
| `subscription.charged` / `subscription.payment_failed` / `subscription.suspended` | Subscriptions |

## Verifying the signature

Every delivery carries:

```
X-Timestamp: 1756700000
X-Signature: v1=<HMAC-SHA256(secret, "<X-Timestamp>.<payload>")>
```

- `secret` is the merchant's **signing secret** (`wp_test_ss_…` / `wp_live_ss_…`, the newest valid one of the same environment). Without a signing secret the merchant password is used
- `payload` is the request body for JSON / form POST and the query string for query GET
- Discard deliveries whose `X-Timestamp` is more than five minutes away from now
- `Wirepay-Signature: t=<timestamp>,v1=<signature>` is sent as well for compatibility

## Retries

- A non-2xx response or a timeout (10 s) is retried after 1 min → 5 min → 30 min → 2 h → 24 h, five attempts in total, then abandoned
- [Merchant portal → Webhook log](/merchant/webhooks) can re-send a delivery manually
- Process deliveries **idempotently** (the same `payment.completed` may arrive more than once)
