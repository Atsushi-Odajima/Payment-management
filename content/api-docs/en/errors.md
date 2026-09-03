# Errors and rate limits

## Error responses

Failures carry an HTTP status and a body of this shape. `message` is localised by the `x-lang` header (`ja` / `en`, default `ja`).

```
{ "ok": false, "error": { "code": "invalid_input", "message": "Invalid input", "details": { "fieldErrors": { "amount": "too_small" } } } }
```

- `code` is a stable string meant for programs (table below)
- `details` depends on the code; `invalid_input` carries `fieldErrors` per field

## Retrying

- `429 rate_limited`: wait for `Retry-After` (seconds) and retry
- `5xx` and network errors: retry with the **same `Idempotency-Key`** to avoid duplicates
- Other `4xx`: fix the request first

## Rate limit

**60 requests per minute** per merchant and environment. Successful responses carry `X-RateLimit-Limit` / `X-RateLimit-Remaining`.

The table below is generated from the server's definitions.
