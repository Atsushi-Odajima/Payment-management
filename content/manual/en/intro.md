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

| Feature | View | Create | Update | Approve / state change | Delete |
|---|---|---|---|---|---|
| Merchants (basic info, notification settings) | ○ | ○ | ○ | — | — |
| Reveal / regenerate merchant password | M | — | M | — | — |
| Contract & fees / limits / deadlines / settlement settings | ○ | ○ | ○ | — | — |
| API keys and signing secrets (issue / rotate / revoke) | ○ | ○ | ○ | — | ○ (revoke) |
| Agents | ○ | ○ | ○ | — | — (disable) |
| Create transaction | ○ | ○ | — | — | — |
| Complete / fail / cancel / expire / reconcile a transaction | ○ | — | — | M | — |
| Refund requests | ○ | ○ | — | M (approve / reject) | — |
| Settlement batches | ○ | ○ (generate) | — | M (confirm / schedule / pay / hold / release) | M (discard while collecting) |
| Webhook deliveries | ○ | — | — | M (resend) | — |
| Chargebacks | ○ | M | — | M (dispute / resolve / confirm) | — |
| Blacklist and detection rule | ○ | M | M | M (approve / reject / disable) | — |
| Deposit-difference follow-up | ○ | — | ○ (refund request / notify / resolve) | — | — |
| Unmatched deposits (register / match by transfer ID / dismiss) | ○ | ○ | ○ (dismiss) | M (match) | — |
| API re-notify (completed bank transfers) | ○ | — | — | M | — |
| Reports and CSV | ○ | — | — | — | — |
| E-mail templates | ○ | — | M | — | — |
| E-mail log | ○ | — | — | — | — |
| Announcements | ○ | ○ | ○ | ○ (publish / end / add update) | — |
| Billing plans | ○ | ○ | ○ | — | — (disable) |
| Subscriptions | ○ | ○ | — | M (charge / pause / resume / cancel) | — |
| Demo charge failure rate | ○ | — | M | — | — |
| Payment links | ○ | ○ | — | ○ (disable) | — |
| Agent fees | ○ | — | — | — | — |
| IP restrictions | ○ | ○ | ○ | — | ○ |
| Payment providers | ○ | ○ | ○ | — | ○ (disable when it has payments) |
| Admin accounts | M | M (invite) | M | M (temporary password / two-factor reset) | — (disable) |
| Own account (password, two-factor) | ○ | — | ○ | — | — |
| Audit log and CSV | ○ | — | — | — | — |
| Global search | ○ (admins only for M) | — | — | — | — |

On the public demo `DEMO_READONLY=1` turns provider updates and every delete into 403, even for masters.
