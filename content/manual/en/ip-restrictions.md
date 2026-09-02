# IP Restrictions

Manage the **allow-list of IP addresses** permitted to reach the admin UI and the merchant API.

## Targets

| Target | Meaning |
|---|---|
| Admin UI | Where this dashboard is accessed from |
| Merchant API | Where a specific merchant's servers call the API from; a merchant must be chosen |

## Rule format

- A single IPv4 address: `203.0.113.10`
- CIDR notation: `198.51.100.0/24` (`/0` to `/32`)

Host bits are normalized on save (`198.51.100.77/24` → `198.51.100.0/24`). IPv6 is not supported yet.

## Your current IP and the verdict

The top of the list shows **your current IP** and how it evaluates against enabled “Admin UI” rules.

| Verdict | Meaning |
|---|---|
| On the allow-list | Matches an enabled rule (the matched rule is shown) |
| Not on the allow-list | No rule matches |
| No enabled admin rules | Nothing configured, so everything is allowed |
| IPv6 — not evaluated | The caller uses IPv6 |

In the demo this is display-only; nothing is blocked. In production the same evaluation would run in middleware and answer 403.

## Add, edit, delete

- **+ Add rule** opens the form: target, (merchant), IP / CIDR, label, enabled. The normalized value is shown while you type.
- **Edit** in the list opens the form; **Delete** removes the rule after a confirmation dialog.
