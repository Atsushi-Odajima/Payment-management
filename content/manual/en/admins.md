# Admin users, audit log and search

This chapter covers the **admin accounts** that operate the dashboard, the **audit log** that records every change, and the **global search** in the header.

## Login and roles

- Login is **login ID + password**. The top page shows the login form; a session lasts 12 hours (the cookie is HMAC-signed and the server re-reads the user row on every request, so disabling an account takes effect immediately).
- Roles (master / general) belong to the account; there is no switch in the UI. See the **permission matrix** in [Introduction](/manual/intro) for what each role may do. Master-only APIs answer 403 (`role_required`); anonymous mutations answer 401.

## Admin management (Settings → Admin users, master only)

- **Invite**: enter login ID, name, e-mail and role; the initial password is **shown once** (the e-mail is recorded in the e-mail log). The account is "Invited" until the person logs in for the first time, then "Active".
- **Edit**: name, e-mail, role and active / disabled. The login ID cannot change. You cannot change your own role or status, and the **last active master** cannot be disabled or demoted.
- **Reissue temporary password**: generates a new password for the user and shows it once.
- **Reset two-factor**: removes two-factor for a user who lost their device; they can enrol again.

## Account settings (your name → Account settings)

- **Change password**: confirm the current password and set a new one of at least 8 characters.
- **Two-factor (TOTP / RFC 6238)**: "Register authenticator" shows a QR code and a manual key. Scan it with Google Authenticator or similar and enter the 6-digit code to enable. Later logins ask for the code after the password (the code step expires after 5 minutes; a ±30-second drift is tolerated). Disabling requires the password again.

## Audit log (Settings → Audit log)

Every data change is recorded **inside the same transaction**: who (an admin, or system / webhook / bank deposit notification / cron / seed), when, which action, on which record, from which IP, and the **before / after** values. Sensitive fields — passwords, credentials, API keys, signing secrets — are stored as `[redacted]`.

- The list filters by actor, action, target type and period, sorts by column and exports **CSV**.
- Clicking a row opens the detail with before / after values side by side; changed fields are highlighted.

Recorded actions (values of the `action` column):

| Area | Actions |
|---|---|
| Authentication / account | `auth.login`, `auth.logout`, `account.password_change`, `account.totp_enable`, `account.totp_disable` |
| Admin users | `admin.create`, `admin.update`, `admin.password_reset`, `admin.totp_reset` |
| Merchants | `merchant.create`, `merchant.update`, `merchant.password_regenerate`, `merchant.fee_update`, `merchant.limit_update`, `merchant.terms_update`, `merchant.settlement_update`, `api_key.issue`, `api_key.rotate`, `api_key.revoke` |
| Agents | `agent.create`, `agent.update` |
| Transactions | `payment.create`, `payment.capture`, `payment.cancel`, `payment.refund`, `payment.fail`, `payment.expire`, `payment.deposit`, `payment.chargeback`, `payment.deposit_diff_update` |
| Refunds | `refund.request`, `refund.approve`, `refund.reject` |
| Settlements | `settlement.generate`, `settlement.confirm`, `settlement.schedule`, `settlement.pay`, `settlement.hold`, `settlement.release`, `settlement.delete` |
| Webhooks | `webhook.resend` |
| Risk | `chargeback.create`, `chargeback.dispute`, `chargeback.resolve`, `chargeback.confirm`, `blacklist.create`, `blacklist.update`, `risk.settings_update` |
| Notices | `email_template.update`, `announcement.create`, `announcement.update`, `announcement.publish`, `announcement.end`, `announcement.add_update` |
| Subscriptions / payment links | `plan.create`, `plan.update`, `subscription.create`, `subscription.charge`, `subscription.pause`, `subscription.resume`, `subscription.cancel`, `payment_link.create`, `payment_link.disable` |
| Settings | `provider.create`, `provider.update`, `provider.delete`, `ip_restriction.create`, `ip_restriction.update`, `ip_restriction.delete`, `demo.reset` |

## Global search

Type two or more characters into the header search box (**Ctrl+K / Cmd+K** focuses it) to search transactions (ID, order number, transfer ID, customer ID, e-mail, customer name, last 4 card digits), merchants (ID, site name, company, e-mail), agents (ID, name, company, e-mail) and admins (master only) at once, grouped by category. Enter opens the full results page.
