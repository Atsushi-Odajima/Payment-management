# Notification centre

Notifications the system raises for operators, shown in the header **bell** and a list screen, optionally delivered by e-mail and Slack per kind. This is separate from merchant-facing announcements — only admins see it.

## Kinds

| Severity | Kind | When | Visible to |
|---|---|---|---|
| Critical | Webhook abandoned | A merchant notification failed five times and was given up | admin / developer |
| Critical | Payment method suspended (global) | A global switch was turned off (per-merchant switches are warnings) | everyone (merchant switches: admin / cs) |
| Critical | Batch failed | A cron job (transfer expiry, webhook retry, subscriptions, method resume, notifications) ended with an exception | admin / developer |
| Critical | Chargeback deadline | A dispute deadline is within three days (checked hourly) | admin / accounting |
| Warning | Overdue transfers (daily) | One digest per day with the number of awaiting transfers past their deadline | admin / accounting / cs |
| Warning | Overdue konbini payments (daily) | Enabled in Phase K | admin / accounting / cs |
| Warning | Blacklist candidate | Repeated-failure detection filed a candidate | admin / cs |
| Warning | Limit exceeded | A checkout was recorded as failed because of a merchant limit | admin / accounting / cs |
| Warning | Subscription payment failed | A charge failed and a retry is pending (the third failure is critical) | admin / accounting / cs |
| Warning | Settlement held | A settlement batch was put on hold | admin / accounting |
| Info | Settlement generated | A settlement batch was generated | admin / accounting |
| Info | Refund requested | A refund request was filed (roles that can decide only) | admin / accounting |
| Info | Merchant registered | A merchant account was issued | admin / accounting / cs |

The same kind for the same target (the same webhook, the same chargeback, …) is emitted **at most once per 24 hours**.

## Screens

- **Bell** (header): unread badge and a dropdown with the latest ten. Clicking an entry marks it read and opens the related screen. Refreshes every 60 seconds.
- **List** (Notices → Notifications): filter by kind, severity, read / unread and period; **Mark all as read** clears the backlog. Read state is per admin.
- **Notification settings** (top right of the list, or bell → settings): per kind, choose **e-mail** and / or **Slack** in addition to in-app, which is always on. You only change your own settings.

## E-mail and Slack

- **E-mail** uses the "notification" template (placeholders `title` / `body` / `link`) and is recorded in the [e-mail log](/manual/emails). Recipient = the admin account's address; language = `EMAIL_DEFAULT_LANG` (default ja).
- **Slack** posts to the **Incoming Webhook URL** in [Global settings](/global-settings) (admin). **Send test** checks the connection. A failed post is retried once; the outcome is kept in the Slack log. Slack cannot be selected in notification settings until the URL is set.
- Delivery happens right after the notification is raised. Notifications raised inside a database transaction are delivered by the hourly cron `/api/cron/notifications` (:50), which also produces the daily digests and the chargeback-deadline reminders.

## API

| Request | Purpose |
|---|---|
| `GET /api/notifications?kind=&severity=&read=unread|read&from=&to=&page=` | The signed-in admin's notifications (with the unread count) |
| `GET /api/notifications/unread` | Bell: unread count and the latest ten |
| `POST /api/notifications/<id>/read` / `POST /api/notifications/read-all` | Mark read |
| `GET/PUT /api/notifications/preferences` | Own kind × channel settings |
| `POST /api/global-settings/slack-test` `{ url? }` | Slack test message (admin) |

In the demo (test runs, or `WEBHOOK_DELIVERY=queue`) nothing is posted to Slack; the log records `demo`.
