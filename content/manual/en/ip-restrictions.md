# IP Restrictions

Manage **IP address rules** for callers of the admin UI and the merchant API. A rule has one of two types.

| Type | Behavior |
|---|---|
| Block | While enabled, matching callers are **actually refused by the admin UI and the API** (pages show “Access blocked”, the API answers 403 `ip_blocked`) |
| Allow | Allow-list entry. While the target's **allow-list mode** is OFF it is informational; while it is ON, callers matching none of the allow rules are refused (403 `ip_blocked`, reason `not_in_allowlist`). Block rules always take precedence |

To shut out an address, add a rule of type **Block** (the default in the form).

## Targets

| Target | Meaning |
|---|---|
| Admin UI | Where this dashboard is accessed from; blocking is enforced |
| Merchant API | Where a specific merchant's servers call the API from; a merchant must be chosen. Callers matching an enabled block rule are refused on `/api/v1/*` and `/api/merchant-api/*` with 403 `ip_blocked` |

## Rule format

- A single IPv4 address: `203.0.113.10`
- CIDR notation: `198.51.100.0/24` (`/0` to `/32`)

Host bits are normalized on save (`198.51.100.77/24` → `198.51.100.0/24`). IPv6 is not supported yet (not evaluated, therefore never blocked).

## Allow-list mode

The “Allow-list mode” panel at the top switches the mode per target (Admin UI / Merchant API; default OFF, permission `ip_restriction.update`, stored in global settings and audited as `global_setting.update`).

| Mode | Behavior |
|---|---|
| OFF | Only block rules refuse callers; allow rules are shown for information |
| ON | With at least one enabled allow rule, callers matching none of them are refused. With zero allow rules nothing is refused (and the mode cannot be turned on) |

- Turning the Admin UI mode on requires your current IP to be covered by an enabled allow rule (`ip_self_block`). While on, allow-rule changes, disabling or deletions that would drop your own IP from the list are refused as well.
- The Merchant API mode applies to each merchant's own “Merchant API” allow rules; merchants without allow rules are unaffected. Both `/api/merchant-api/*` and the public API `/api/v1/*` are covered.
- API: `GET/PUT /api/ip-restrictions/allowlist` `{ target, enabled }` (`allowlist_no_rules` / `ip_self_block`).

## Lock-out protection

An enabled “Admin UI / Block” rule that covers your own current IP cannot be saved (`ip_self_block`). You may save it disabled and enable it from another address. See above for allow-rule changes while allow-list mode is on.

## Your current IP and the verdict

The top of the list shows **your current IP** and how it evaluates against enabled “Admin UI” rules.

| Verdict | Meaning |
|---|---|
| Blocked | Matches an enabled block rule (cannot happen while you can see this page) |
| On the allow-list | Matches an allow rule (the matched rule is shown) |
| Not on the allow-list | Allow rules exist but none matches; not refused while allow-list mode is OFF, refused while ON (OFF whenever you can see this page) |
| No allow-list configured | No allow rules |
| IPv6 — not evaluated | The caller uses IPv6 |

Because the check needs the database, it runs in `app/layout.tsx` for pages and in `withApiHandler` for API routes rather than in the Edge middleware. PSP webhooks and the deposit notification API are not admin traffic and are exempt.

## Add, edit, delete

- **+ Add rule** opens the form: target, type, (merchant), IP / CIDR, label, enabled. The normalized value is shown while you type.
- **Edit** in the list opens the form; **Delete** removes the rule after a confirmation dialog.
- The list can be filtered by type, target and enabled state.
