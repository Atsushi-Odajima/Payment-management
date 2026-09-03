# Webhook log

Whenever a transaction changes state, Wire Pay sends a webhook (notification) to the merchant's **notification URL**. This screen records every delivery, shows failures and lets a master resend. The payload format is described in the [Notification spec](/manual/notification-spec).

## Events

| Event | When |
|---|---|
| `payment.completed` | The transaction is completed (manual completion, provider webhook, matching / excess deposit) |
| `payment.failed` | The transaction failed |
| `payment.expired` | An awaited transfer passed its deadline (including the hourly job) |
| `payment.cancelled` | The transaction was cancelled |
| `refund.completed` | A refund was approved and completed |
| `limit.exceeded` | A transaction was recorded as failed because of the merchant's limits |
| `chargeback.opened` | A chargeback was registered |
| `subscription.*` | Subscription charged / payment failed / suspended |

## Signature

| Header | Content |
|---|---|
| `X-Timestamp` | Send time (UNIX seconds) |
| `X-Signature` | `v1=<hex HMAC-SHA256(key, "<X-Timestamp>.<payload>")>` |
| `Wirepay-Signature` | Compatibility: `t=<X-Timestamp>,v1=<same value>` |

- The **key** is the merchant's **signing secret** (issued on the merchant's API keys tab; the newest usable one of the test / live mode). When none has been issued, the merchant password is used.
- The **payload** is the raw request body for POST (JSON / form) and the query string (after `?`) for GET.
- Recompute `v1` on your side, compare it in constant time and reject requests whose `X-Timestamp` is older than 5 minutes.

## Retries and abandonment

A non-2xx response or no response within **10 seconds** counts as a failure. Deliveries are retried up to 5 times with backoff of **1 min → 5 min → 30 min → 2 h → 24 h** (the hourly cron `/api/cron/webhook-retry` sends the ones that are due). After the 5th failure the delivery is **abandoned** and counted in the dashboard's “webhook failures” figure.

## List, detail and resend

- The list shows failed / abandoned / retrying deliveries first and filters by merchant, event, status and period; CSV export is available. The merchant detail's **Webhook log** tab shows that merchant's recent notifications.
- The detail shows the request (headers and body), the last response (first 1 KB) and every attempt (number, response code, duration, trigger).
- **Resend now** (master role) sends immediately as a new attempt regardless of the schedule, abandoned deliveries included, and is written to the audit log.

## Demo receiver

The seeded merchants notify `/api/demo/webhook-receiver`. The query selects the behaviour so you can watch the retry logic:

| Query | Response |
|---|---|
| `?result=ok` | 200 (echoes what was received) |
| `?result=error` | 500 (failure → retry) |
| `?result=timeout` | responds after 12 seconds (timeout → retry) |
