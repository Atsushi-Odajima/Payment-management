# Test card numbers

In the test environment (`wp_test_ak_` keys) the numbers below reproduce **specific outcomes** when sent as `card.number`. Any other Luhn-valid number succeeds. In the live environment these numbers answer 400 `test_card_in_live`.

- Any future expiry works (e.g. `expMonth: 12, expYear: 2028`)
- `cvc` is validated but never stored; only the brand, the last 4 digits and a fraud-detection hash are kept
- Failure scenarios are recorded as `status: "failed"` with `failureReason` (the outcome below) and show up in the merchant portal
- The "stops at authorized" scenario returns `status: "authorized"`; the Wire Pay dashboard can complete (capture) it

## Testing konbini and bank transfers

- Konbini: the response carries `konbini.receiptNo`. In the test environment the Wire Pay dashboard (deposit reconciliation) or the demo payment-notification API marks it paid
- Bank transfer: `bankTransfer.transferId` is returned and completed the same way

The table below is generated from the server's definitions.
