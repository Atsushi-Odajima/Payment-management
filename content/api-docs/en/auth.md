# Authentication and environments

## API keys

Send `Authorization: Bearer <API key>` with every request. Wire Pay issues the keys; the plaintext is shown once at issue time (only a hash is stored).

| Prefix | Environment | Use |
|---|---|---|
| `wp_test_ak_` | test | Development and verification; test card numbers work, nothing is charged |
| `wp_live_ak_` | live | Production; test card numbers are refused (`test_card_in_live`) |
| `wp_test_ss_` / `wp_live_ss_` | — | **Signing secrets**. Not accepted for API calls; used to verify webhook signatures |

- The key's environment selects the data: transactions created with a test key are invisible to a live key (404)
- Revoked and expired keys answer 401 `invalid_api_key`. After a rotation the old key keeps working for the grace period (7 days by default)
- When the merchant has **IP restrictions (merchant_api)**, other sources answer 403 `ip_blocked`

## Rotation

- Test keys can be rotated by the merchant in [Merchant portal → API keys](/merchant/api-keys)
- Live keys are issued, rotated and revoked by Wire Pay operators

## Enabled payment methods

`method` in `POST /transactions` accepts only the methods enabled in your contract (otherwise 400 `method_not_enabled`). Methods suspended by Wire Pay or for your account answer 409 `method_suspended`; see [Merchant portal → Payment methods](/merchant/methods).

## Connectivity check

```
curl https://<your-host>/api/v1/transactions?limit=1 -H 'Authorization: Bearer wp_test_ak_…'
```

`ok: true` confirms the key works.
