# Agent fees

Monthly referral fees: each agent's **fee rate** applied to the **payout of the settlement batches** of the merchants it referred. There is no separate table — the settlement batches are the ledger and the figures are computed on demand.

## How it is calculated

- Counted batches are those of merchants with an **agent** assigned whose status is **confirmed / scheduled / paid**. Collecting and held batches are excluded until they are confirmed.
- A batch belongs to the month in which its **settlement period starts** (Japan time).
- Fee = net payout × fee rate (%), rounded down to the yen. A batch with a negative payout yields 0.
- The agent's current fee rate is used (changing it also changes past months on screen — keep the CSV if you need a frozen figure).
- Only settlements in the mode of the header's test / live switch are counted.

## Screen

- Filter by **month** and **agent**; each agent row shows the totals (payout, fee, merchants, settlements). **Show breakdown** opens the per-merchant / per-batch lines with links to the settlement detail.
- **CSV** exports the lines (agent, merchant, period, status, payout, fee rate, fee).
- The agent detail screen shows the current month's summary as well.

## Permissions

| Action | Master | General |
|---|---|---|
| View / CSV | ○ | ○ |

This is a report with no write operation, so nothing is audited here. Changing an agent's fee rate is recorded as `agent.update`.
