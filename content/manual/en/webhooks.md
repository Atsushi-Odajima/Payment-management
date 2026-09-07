# Webhook delivery log

Whenever a transaction, refund, chargeback or subscription changes state, a webhook (notification) is sent to the merchant's **notification URL**. This screen records every delivery and lets you inspect failures and resend. The payload format and signature verification are described in the [notification parameter specification](/manual/notification-spec).

## Events

| Event | When |
|---|---|
| `payment.completed` | The transaction completed (manual capture, payment-link completion, exact / excess deposit, auto-capture from the merchant site) |
| `payment.failed` | The transaction failed |
| `payment.expired` | Expired after the transfer deadline (including the hourly job) |
| `payment.cancelled` | The transaction was cancelled |
| `refund.completed` | A refund was approved and completed |
| `limit.exceeded` | A transaction was recorded as failed because a merchant limit was exceeded |
| `chargeback.opened` | A chargeback was registered |
| `subscription.charged` | A subscription charge succeeded |
| `subscription.payment_failed` | A subscription charge failed and a retry is scheduled |
| `subscription.suspended` | A subscription was suspended after its third failure |

The request follows the merchant's notification settings (format / parameter set / identifiers) and always carries the `event` parameter. Transactions without a merchant (provider-only transactions) produce no webhook.

## Signature

| Header | Content |
|---|---|
| `X-Timestamp` | Send time (UNIX seconds) |
| `X-Signature` | `v1=<hex of HMAC-SHA256(key, "<X-Timestamp>.<payload>")>` |
| `Wirepay-Signature` | Compatibility: `t=<X-Timestamp>,v1=<same value>` |

- The **key** is the merchant's **signing secret** (issued on the API keys tab of the merchant detail; the newest usable one of the same test / live mode). **Without a usable signing secret for that mode the webhook is not sent** (the password is never used as a fallback): the delivery is recorded as `failed` with `error: signing_secret_missing` and the notification centre gets “Webhook signing secret missing” (warning, once per merchant × mode per 24 h). Issue a secret, then **Resend now** signs and sends it. A test signing secret is issued automatically when a merchant is created and shown once on the completion screen.
- The **payload** is the raw request body for POST (JSON / form) and the query string (after `?`) for GET.
- Receivers recompute `v1` the same way, compare in constant time and reject an `X-Timestamp` older than 5 minutes (code sample in the specification chapter).

## Retries and abandonment

A non-2xx response, or no response within **10 seconds**, is recorded as a failure and retried automatically after **1 min → 5 min → 30 min → 2 h → 24 h**, five attempts at most (due retries are sent by the cron `/api/cron/webhook-retry` at :30 every hour). After the fifth failure the delivery is **abandoned** and counted in the dashboard's "failed webhooks" figure.

| Status | Meaning |
|---|---|
| Pending | Created but not sent yet (tests and `WEBHOOK_DELIVERY=queue` stop here; the cron sends it) |
| Success | A 2xx response was received |
| Retrying | Failed; waiting for the next retry time |
| Failed | The last attempt failed with no retry scheduled (a manual resend restarts it) |
| Abandoned | Five attempts failed |

## List, detail and resend

- The list shows failed / abandoned / retrying deliveries first and filters by merchant, event, status and period. CSV export is available. The **Webhook log** tab of the merchant detail shows that merchant's recent deliveries.
- The detail shows the request (method, URL, headers, body), the last response (status code and first 1 KB) and the attempt history (count, response code, duration, trigger = automatic / cron / dashboard).
- **Resend now** (master) sends a new attempt immediately regardless of the retry schedule. Abandoned deliveries can be resent as well; the action is audited (`webhook.resend`). A resend recomputes `X-Timestamp` and the signature.

## Demo receiver

The seeded merchants point their notification URL at `/api/demo/webhook-receiver`. A query parameter switches its answer so you can watch the retry behaviour. Relative URLs are resolved against `APP_URL` (falling back to the Vercel production URL, or `http://localhost:3000` locally).

| Query | Response |
|---|---|
| `?result=ok` | 200 (echoes the request) |
| `?result=error` | 500 (failure → retry) |
| `?result=timeout` | answers after 12 seconds (timeout → retry) |
