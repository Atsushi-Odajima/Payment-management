# Roles and permissions

Admin accounts have one of five roles, and the role decides **which operation is allowed on which feature**. The check happens server-side (API and pages); buttons and menus merely reflect it. The per-feature table is in [Introduction](/manual/intro) (generated from the definition in `lib/role.ts`).

## The five roles

| Role | Intended for | Summary |
|---|---|---|
| admin | The person in charge | Everything. Only admin manages admin accounts, global settings, global payment-method suspension, transaction state changes and note deletion |
| accounting | Settlements and deposits | Generate / confirm / schedule / pay / hold settlement batches, approve or reject refunds, reconcile deposits and unmatched deposits, contract / fees / limits / settlement settings, chargebacks, reports, agent fees. Read-only elsewhere |
| cs (customer support) | Merchant and customer care | Create transactions, request refunds, transaction notes and pins, register / dismiss unmatched deposits, deposit-difference follow-up, API re-notify, create / publish announcements, register / update merchants and agents, plans / subscriptions / payment links, blacklist, per-merchant payment-method suspension, unmasking personal data (Phase M). Read-only elsewhere |
| developer | Engineering | Resend webhooks, issue / rotate / revoke API keys, IP restrictions, payment providers, e-mail templates, demo failure rate, API re-notify. Read-only elsewhere |
| viewer | Audit / read-only | View only. CSV export only when enabled in [Global settings](/global-settings) |

The former **Master became admin and General became cs** automatically (the seed migrates rows idempotently and old session cookies are mapped).

## Setting the role

- **Invite / edit** (Settings → Admin users, admin only) picks the role. The detail screen lists "What this role can do".
- You cannot change your own role or status, and the **last active admin** cannot be demoted or disabled.
- A changed role applies from the next request (the server re-reads the user row every time).

## When a permission is missing

- The API answers `403 permission_required`; buttons are disabled or hidden and navigation items follow the same rules (e.g. Admin users and Global settings appear for admin only).
- Anonymous visitors can only view; every mutation answers 401. Only the top page requires a login.
- On the public demo `DEMO_READONLY=1` turns deletes and provider updates into 403 even for admin.

## CSV export

admin / accounting / cs / developer can always export CSV. viewer (and anonymous visitors) can only when "Allow the viewer role to export CSV" is on in Global settings; otherwise the export answers `403 csv_export_disabled`.

## Demo accounts

| Role | Login ID |
|---|---|
| admin | `kuromaru` |
| cs | `general` |
| accounting | `accounting` |
| developer | `developer` |
| viewer | `viewer` |

Passwords are shown in the login-page hint when `DEMO_LOGIN_HINT` is set.
