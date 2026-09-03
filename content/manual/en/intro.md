# Introduction

Wire Pay is a dashboard for payment-service-provider (PSP) operators to handle **merchants, agents, transactions (payment applications / payments), refunds, settlements, webhooks, risk controls, reports, notices, subscriptions and payment links** in one place. This manual explains each feature and the notification / API specifications for merchants.

## About demo mode

The demo never calls an external payment API.

- **Connection tests** only validate the shape of the credentials.
- **Creating, completing, cancelling, refunding, reconciling and charging subscriptions** update the database only; no money moves. Subscription charges fail at a configurable demo rate.
- **Webhooks to merchants are really sent.** The seeded merchants point at a demo receiver ([Webhook delivery log](/manual/webhooks)).
- **E-mails** are not sent; they are recorded in the e-mail log as "demo (not sent)" (`EMAIL_PROVIDER` swaps the provider).
- **IP restriction** block rules are enforced (a blocked screen for pages, 403 for the API). A rule that would block your own address cannot be saved.
- Demo data is reset every day; anything you add or edit may be gone the next day.

## Login and language

The top page asks for a **login ID and password** (plus the authenticator code when two-factor is enabled). A session lasts 12 hours. Every screen can be viewed publicly, but **creating, updating and deleting require a login**. Your name in the top-right corner opens Account settings.

The **EN / 日本語** toggle switches the language; the choice is saved for the next visit. Amounts are always Japanese yen (¥) and times are Japan time (Asia/Tokyo). The **test / live** switch in the header selects the data mode used by lists, the dashboard and reports.

## Permission matrix

Roles (master / general) belong to the signed-in admin account and are enforced server-side (API and pages). Legend: **○** = master and general, **M** = master only, **—** = no such operation. Anonymous visitors can only view (the top page requires a login).

<!-- permissions:start -->
| Feature | Action | admin | accounting | cs | developer | viewer |
|---|---|---|---|---|---|---|
| Merchants | View | ○ | ○ | ○ | ○ | ○ |
| Merchants | Create | ○ |  | ○ |  |  |
| Merchants | Update | ○ |  | ○ |  |  |
| Merchants | Reveal password | ○ |  |  |  |  |
| Merchants | Regenerate password | ○ |  |  |  |  |
| Contract & fees / limits / deadlines / settlement settings | View | ○ | ○ | ○ | ○ | ○ |
| Contract & fees / limits / deadlines / settlement settings | Update | ○ | ○ |  |  |  |
| API keys and signing secrets | View | ○ | ○ | ○ | ○ | ○ |
| API keys and signing secrets | Issue | ○ |  |  | ○ |  |
| API keys and signing secrets | Rotate | ○ |  |  | ○ |  |
| API keys and signing secrets | Revoke | ○ |  |  | ○ |  |
| Agents | View | ○ | ○ | ○ | ○ | ○ |
| Agents | Create | ○ |  | ○ |  |  |
| Agents | Update | ○ |  | ○ |  |  |
| Transactions | View | ○ | ○ | ○ | ○ | ○ |
| Transactions | Create | ○ |  | ○ |  |  |
| Transactions | Complete / fail / cancel / expire | ○ |  |  |  |  |
| Transactions | Reconcile deposit | ○ | ○ |  |  |  |
| Transactions | API re-notify | ○ |  | ○ | ○ |  |
| Transactions | Simulate webhook | ○ |  |  | ○ |  |
| Transaction notes | View | ○ | ○ | ○ | ○ | ○ |
| Transaction notes | Create | ○ | ○ | ○ | ○ |  |
| Transaction notes | Edit own notes | ○ | ○ | ○ | ○ |  |
| Transaction notes | Delete | ○ |  |  |  |  |
| Transaction notes | Pin | ○ |  | ○ |  |  |
| Unmatched deposits | View | ○ | ○ | ○ | ○ | ○ |
| Unmatched deposits | Register | ○ | ○ | ○ |  |  |
| Unmatched deposits | Match | ○ | ○ |  |  |  |
| Unmatched deposits | Dismiss | ○ | ○ | ○ |  |  |
| Deposit differences | View | ○ | ○ | ○ | ○ | ○ |
| Deposit differences | Update | ○ | ○ | ○ |  |  |
| Refunds | View | ○ | ○ | ○ | ○ | ○ |
| Refunds | Request | ○ |  | ○ |  |  |
| Refunds | Force past the window | ○ |  |  |  |  |
| Refunds | Approve / reject | ○ | ○ |  |  |  |
| Settlement batches | View | ○ | ○ | ○ | ○ | ○ |
| Settlement batches | Generate | ○ | ○ |  |  |  |
| Settlement batches | Confirm / schedule / pay / hold / release | ○ | ○ |  |  |  |
| Settlement batches | Delete | ○ | ○ |  |  |  |
| Agent fees | View | ○ | ○ | ○ | ○ | ○ |
| Reports | View | ○ | ○ | ○ | ○ | ○ |
| Webhook deliveries | View | ○ | ○ | ○ | ○ | ○ |
| Webhook deliveries | Resend | ○ |  |  | ○ |  |
| Chargebacks | View | ○ | ○ | ○ | ○ | ○ |
| Chargebacks | Create | ○ | ○ |  |  |  |
| Chargebacks | Update | ○ | ○ |  |  |  |
| Blacklist | View | ○ | ○ | ○ | ○ | ○ |
| Blacklist | Create | ○ |  | ○ |  |  |
| Blacklist | Update | ○ |  | ○ |  |  |
| Detection rule | View | ○ | ○ | ○ | ○ | ○ |
| Detection rule | Update | ○ |  | ○ |  |  |
| E-mail templates | View | ○ | ○ | ○ | ○ | ○ |
| E-mail templates | Update | ○ |  |  | ○ |  |
| E-mail log | View | ○ | ○ | ○ | ○ | ○ |
| Announcements | View | ○ | ○ | ○ | ○ | ○ |
| Announcements | Create | ○ |  | ○ |  |  |
| Announcements | Update | ○ |  | ○ |  |  |
| Announcements | Publish / end / add update | ○ |  | ○ |  |  |
| Billing plans | View | ○ | ○ | ○ | ○ | ○ |
| Billing plans | Create | ○ |  | ○ |  |  |
| Billing plans | Update | ○ |  | ○ |  |  |
| Subscriptions | View | ○ | ○ | ○ | ○ | ○ |
| Subscriptions | Create | ○ |  | ○ |  |  |
| Subscriptions | Charge / pause / resume / cancel | ○ |  | ○ |  |  |
| Demo charge failure rate | View | ○ | ○ | ○ | ○ | ○ |
| Demo charge failure rate | Update | ○ |  |  | ○ |  |
| Payment links | View | ○ | ○ | ○ | ○ | ○ |
| Payment links | Create | ○ |  | ○ |  |  |
| Payment links | Disable | ○ |  | ○ |  |  |
| IP restrictions | View | ○ | ○ | ○ | ○ | ○ |
| IP restrictions | Create | ○ |  |  | ○ |  |
| IP restrictions | Update | ○ |  |  | ○ |  |
| IP restrictions | Delete | ○ |  |  | ○ |  |
| Payment providers | View | ○ | ○ | ○ | ○ | ○ |
| Payment providers | Create | ○ |  |  | ○ |  |
| Payment providers | Update | ○ |  |  | ○ |  |
| Payment providers | Delete | ○ |  |  | ○ |  |
| Payment providers | Connection test | ○ |  |  | ○ |  |
| Payment method suspension | View | ○ | ○ | ○ | ○ | ○ |
| Payment method suspension | Suspend globally | ○ |  |  |  |  |
| Payment method suspension | Suspend per merchant | ○ |  | ○ |  |  |
| Admin accounts | View | ○ |  |  |  |  |
| Admin accounts | Create | ○ |  |  |  |  |
| Admin accounts | Update | ○ |  |  |  |  |
| Admin accounts | Temporary password / 2FA reset | ○ |  |  |  |  |
| Own account | Update | ○ | ○ | ○ | ○ | ○ |
| Audit log | View | ○ | ○ | ○ | ○ | ○ |
| Global search (admins) | View | ○ |  |  |  |  |
| Global settings | View | ○ |  |  |  |  |
| Global settings | Update | ○ |  |  |  |  |
| CSV export | Export | ○ | ○ | ○ | ○ |  |
| Personal data | Unmask | ○ |  | ○ |  |  |
<!-- permissions:end -->

On the public demo `DEMO_READONLY=1` turns provider updates and every delete into 403, even for masters.
