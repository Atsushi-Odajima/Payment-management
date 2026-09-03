# Public API and API docs

Operator notes on the **public API (`/api/v1`)** called directly by merchant sites and its documentation (`/docs/api`). The [API docs](/docs/api) and `GET /api/v1/openapi.json` are the specification of record.

## Overview

| Endpoint | Purpose |
|---|---|
| `POST /api/v1/transactions` | Create a transaction (credit / QR / konbini / bank transfer) |
| `GET /api/v1/transactions` | The merchant's transactions (per environment, cursor paging) |
| `GET /api/v1/transactions/{id}` | One transaction |
| `POST /api/v1/refunds` | Refund request (same review flow as the dashboard) |
| `POST /api/v1/payment-links` | Issue a payment link |
| `GET /api/v1/openapi.json` | The OpenAPI 3 document (the single spec; a test checks it against the routes) |

- Authentication is the merchant's **API key** (Bearer, `wp_test_ak_` / `wp_live_ak_`). The merchant and the environment (test / live) come from the key and cannot be chosen in the request
- The merchant's **IP restrictions (merchant_api)**, **payment-method suspensions**, **limits** and the **blacklist** all apply through the same code as dashboard creation (`createTransaction`)
- **Rate limit**: 60 requests per minute per merchant and environment, counted in a database table (`ApiRateLimit`) so every instance shares it; beyond that 429 with `Retry-After`
- Transactions created through the API show "Public API" as the actor in the history and "Merchant (API / portal)" in the audit log

## Test card numbers

In the test environment specific `card.number` values reproduce success, authorized-only and the failure scenarios (see the "Test card numbers" chapter of the API docs, `lib/public-api/test-cards.ts`). A test number sent with a live key answers 400 `test_card_in_live`.

## API docs (`/docs/api`)

- A public page, no login. The guides on the left (Getting started / Authentication / Errors / Test cards / Webhooks / Sandbox) are hand-written in `content/api-docs/{ja,en}/*.md`; the **API reference** below them is generated from the OpenAPI document
- Reachable from the Settings navigation ("API docs"). Point merchants to it together with the sandbox in the [merchant portal](/manual/merchant-portal)

## Operating notes

- Live keys are issued, rotated and revoked on the dashboard (merchant detail → API keys tab); merchants rotate test keys themselves
- API refund requests arrive as `refund.request` in the notification centre and on the refunds screen; admin / accounting approve or reject them as usual
