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

The **role toggle** in the header switches the demo role.

| Action | Master | General |
|---|---|---|
| Browse every screen | ✓ | ✓ |
| Add / edit merchants, agents and IP rules | ✓ | ✓ |
| Reveal or regenerate a merchant password | ✓ | ✗ |
| Complete / fail / cancel / expire a transaction, reconcile deposits | ✓ | ✗ |
| Refund | ✓ | ✓ |

Roles are enforced on the server (API). Switching the toggle in the UI alone never grants access to passwords or transaction changes. In production the toggle is replaced by the signed-in user's role.

## Login

When `ADMIN_PASSWORD` is configured, browsing stays open but **creating, updating and deleting require a login**. Use “Log in” in the header.

## Language

Use the **EN / 日本語** toggle in the header. The choice is remembered. Amounts are always shown in Japanese yen (¥) and times in Japan time (Asia/Tokyo).
