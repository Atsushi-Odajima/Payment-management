# Risk management

Three screens: chargebacks, the blacklist (with repeated-failure detection) and deposit differences. All of them follow the **Test / Live** switch in the header.

## Chargebacks

Register disputes received from the card network and track the dispute and its outcome. Registering, disputing and recording outcomes all require the **master role**.

| Status | Meaning | Next actions |
|---|---|---|
| Received | Just registered | Dispute (evidence note required) / Confirm |
| Disputed | Dispute filed with evidence | Record win / Record loss / Confirm |
| Won | The dispute was accepted; the transaction stays completed | — |
| Lost | The dispute was rejected; the transaction becomes **Chargeback** | Confirm |
| Confirmed | Final; the transaction is Chargeback and the amount is deducted in settlements | — |

- Register from “Register chargeback” on the transaction detail or on the chargeback list: pick the transaction (Completed / Partially refunded / Refunded), the disputed amount, the reason code (fraud / not received / not as described / duplicate charge / other), the dispute deadline (default 14 days) and an evidence note. The merchant receives a `chargeback.opened` webhook.
- The list shows open cases (received / disputed) first, nearest deadline first; deadlines within 3 days are highlighted.
- Lost and confirmed amounts are deducted as the “chargebacks” total when a [settlement batch](/manual/settlements) is generated.

## Blacklist

A deny list of cards, IP addresses and email addresses.

- **Repeated-failure detection** (master): M failures from the same card fingerprint / source IP / email within N minutes file an automatic **candidate** (default 10 minutes / 3 failures). Candidates show as badges on the dashboard and the risk menu; a master **approves** (active) or **rejects** them.
- **Manual entries** (master) are active immediately. Cards are matched by the transaction's card fingerprint (in the demo, SHA-256 of `brand|last4|expiry`), IPs as IPv4, emails lower-case.
- A checkout matching an active entry is recorded as **Failed (blocked by the blacklist)**; the transaction detail shows which kind matched. Entries can be disabled and re-enabled at any time.
- The transaction creation API accepts demo card details (brand, last 4, expiry) and the source IP; the detail shows “Card last 4” and “Source IP”, and global search also finds transactions by the last 4 digits.

## Deposit differences

Bank transfers whose reconciliation left a **short** or **excess** deposit, with their follow-up state.

| Follow-up | Meaning |
|---|---|
| Open | Just reconciled (set automatically) |
| Refund arranged | A [refund request](/manual/refunds) for the excess was filed (refunded once a master approves) |
| Top-up requested | The customer was asked to pay the balance (sent and logged with the email template) |
| Resolved | Follow-up closed |

- Excess: **Request refund of excess** files a refund request for the excess amount (reason: duplicate payment).
- Short: **Mark top-up requested** records that the customer was asked; when the balance arrives, reconciliation completes the transaction.
- **Resolve** closes the case either way. The number of open cases is shown on the dashboard.
