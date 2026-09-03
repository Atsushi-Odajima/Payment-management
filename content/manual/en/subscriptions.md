# Subscriptions

Manage **recurring billing (subscriptions)** that charge a customer repeatedly according to a **billing plan**. Every charge creates an ordinary transaction, so sales, refunds, settlements and reports all work through the existing screens.

## Billing plans

| Field | Description |
|---|---|
| Merchant | The merchant that owns the plan (fixed after creation) |
| Plan name / amount | The amount billed per interval (JPY) |
| Billing interval | Monthly / yearly / weekly |
| Trial period | Days between the start of the subscription and the first charge (0 = charge immediately) |
| Active | A disabled plan accepts no new subscriptions (existing ones keep being charged) |

Create plans with **+ New plan** and edit them from the plan list. Changes to the amount or interval apply to the next charge onwards.

## Starting a subscription and its statuses

**+ Start subscription** asks for an active plan plus the customer's ID, name and e-mail. The test / live switch in the header decides the mode of the subscription.

| Status | Meaning |
|---|---|
| Trialing | Inside the trial period; its end becomes the next charge date |
| Active | Charged automatically on the next charge date |
| Past due | The last charge failed and a retry is pending |
| Suspended | Three consecutive failures, or paused by an operator. Nothing is charged until it is resumed |
| Cancelled | Ended. Cannot be resumed |

## Charges and retries

- The hourly cron (`/api/cron/subscriptions`, at :15) charges every trialing / active / past-due subscription whose **next charge date has passed**.
- A charge creates a transaction with the merchant's credit-card provider (same mode). On success the transaction is **completed**, the next charge date advances by one interval and the merchant receives the `subscription.charged` webhook.
- On failure the failure count increases and the charge is retried **after 3 days, then 7 days** (webhook `subscription.payment_failed`, "payment failed" e-mail to the customer). The third failure **suspends** the subscription (webhook `subscription.suspended`, "suspended" e-mail).
- **Charge now (success)** / **Charge now (simulate failure)** on the detail screen run the same process with a fixed outcome. **Pause** → suspended, **Resume** → active (chargeable immediately), **Cancel** is final.
- The demo failure rate can be changed in the **Demo charge failure rate** box on the list (master only). The cron and the default "charge now" fail at that probability.

Transactions created by a charge are marked "Subscription" in the transaction detail; refunds and chargebacks follow the normal procedure.

## Permissions

| Action | Master | General |
|---|---|---|
| View | ○ | ○ |
| Create / edit plans, start subscriptions | ○ | ○ |
| Charge now, pause, resume, cancel | ○ | × |
| Change the demo failure rate | ○ | × |

Every change is written to the audit log (`plan.*` / `subscription.*`).
