# Introduction

Wire Pay is a dashboard for payment service provider (PSP) operators to manage **merchants, agents, payment applications (transactions), payments and access restrictions** in one place. This manual explains each screen and documents the notification a merchant receives.

## About demo mode

This demo never calls an external payment API.

- **Connection tests** only validate the shape of the credentials you enter.
- **Creating, capturing, voiding and refunding payments** only updates records in the database; no money moves.
- **Notifications (webhooks)** are not delivered. The merchant screens show a live sample of the request that would be sent.
- **IP restrictions** do not block anything; the screen only shows the verdict for your current IP.
- Demo data is reset daily. Records you add or edit may disappear the next day.

## Roles (Master / General)

The role (master / general) belongs to the signed-in admin account.

| Action | Master | General |
|---|---|---|
| Browse every screen | ✓ | ✓ |
| Add / edit merchants, agents and IP rules | ✓ | ✓ |
| Reveal or regenerate a merchant password | ✓ | ✗ |
| Complete / fail / cancel / expire a transaction, reconcile deposits | ✓ | ✗ |
| Refund | ✓ | ✓ |

Roles are enforced on the server (API). The role belongs to the signed-in admin account and is enforced by the API; see the “Admins, Audit Log & Search” chapter.

## Login

Opening the top page shows the login screen: sign in with your **login ID and password** (plus the authenticator code when two-factor is enabled). The session lasts 12 hours; browsing is open, but **creating, updating and deleting require a login**. Your name in the header opens “Account settings”.

## Language

Use the **EN / 日本語** toggle in the header. The choice is remembered. Amounts are always shown in Japanese yen (¥) and times in Japan time (Asia/Tokyo).
