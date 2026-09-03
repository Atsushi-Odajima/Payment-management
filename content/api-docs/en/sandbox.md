# Sandbox

[Merchant portal → Sandbox](/merchant/sandbox) calls the **real public API (`/api/v1`)** with a test API key. It is not a separate mock: the same code path serves live keys, so a request that works here works in production.

## How to use it

1. Sign in to the merchant portal and find a test key (`wp_test_ak_…`) under "API keys" (ask Wire Pay to issue one if none exists)
2. Open "Sandbox", paste the key and pick an endpoint; the request body can be filled with an example
3. "Send" calls the API from your browser and shows the HTTP status, the duration and the response, plus the equivalent curl command

## Notes

- The key is kept in this browser's **sessionStorage** only and never sent to the server except as the Authorization header of the API call
- Live keys (`wp_live_ak_`) are refused
- Transactions created in the sandbox are real test-environment data: they appear in the merchant portal and the Wire Pay dashboard, and webhooks are really sent
- The rate limit (60 requests per minute) applies to the sandbox too
