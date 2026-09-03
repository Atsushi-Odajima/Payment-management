# Admins, Audit Log & Search

This chapter covers the **admin accounts** that operate the dashboard, the **audit log** that records every change, and the **global search** in the header.

## Login and roles

- Sign in with a **login ID and password**. Opening the top page shows the login screen; the session then lasts 12 hours.
- The role belongs to the account (there is no toggle in the UI).

| Feature | Master | General |
|---|---|---|
| View every screen | ✓ | ✓ |
| Create / edit merchants, agents, IP rules | ✓ | ✓ |
| Reveal / regenerate a merchant password | ✓ | ✗ |
| Complete / fail / cancel / expire a transaction, reconcile deposits | ✓ | ✗ |
| Refund | ✓ | ✓ |
| Invite / edit admins, issue temporary passwords, reset two-factor | ✓ | ✗ |
| View the audit log | ✓ | ✓ |

## Admin Users (Settings → Admin Users, master only)

- **Invite**: enter login ID, name, email and role; the initial password is **shown once** (the demo shows it instead of emailing it). The account starts as “Invited” and becomes “Active” on the first login.
- **Edit**: name, email, role and active / disabled. The login ID cannot be changed. You cannot change your own role or status, and the **last active master** cannot be disabled or demoted.
- **Issue temporary password**: generates a new password for the user, shown once.
- **Reset two-factor**: turns two-factor off for a user who lost their device; they can enrol again.

## Account settings (your name in the header → Account settings)

- **Change password**: confirm the current password and set a new one of at least 8 characters.
- **Two-factor authentication (TOTP, RFC 6238)**: “Set up an authenticator app” shows a QR code and a manual-entry key. Scan it with Google Authenticator or similar and enter the 6-digit code to enable it. Logins then ask for a code after the password (the code step expires after 5 minutes; a ±30 s clock skew is tolerated). Disabling requires the password again.

## Audit Log (Settings → Audit Log)

Every data change is recorded: who (an admin, or a system actor such as a webhook, the deposit notification or cron), when, which action, on what, from which IP, and the **before / after** values. Sensitive fields such as passwords and credentials are stored as `[redacted]`.

- The list filters by actor, action, target type and period, sorts by column and exports to **CSV**.
- Clicking a row opens the entry with the before / after values side by side; changed fields are highlighted.

Recorded actions: login / logout, password change, enabling / disabling two-factor, admin invitation / update / temporary password, merchant create / update / password regeneration, agent create / update, transaction create / complete / cancel / refund / fail / expire / deposit reconciliation, provider connect / update / delete, IP rule add / update / delete, demo reset.

## Global search

Type at least 2 characters into the header search box (**Ctrl+K / Cmd+K** focuses it) to search transactions (transaction ID, order number, transfer ID, user ID, email, user name), merchants (ID, site name, company, email), agents (ID, name, company, email) and admins (master only) at once, grouped by category. Enter opens the full results page.
