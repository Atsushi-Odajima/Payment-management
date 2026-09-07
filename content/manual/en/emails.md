# Email templates and log

Emails to customers, merchants and operators are produced from templates on transaction events, and every message is recorded in the email log.

## Templates

| Key | Sent when | Recipient |
|---|---|---|
| Transfer instructions `transfer_guide` | A bank-transfer transaction is created and a transfer ID issued | Customer |
| Payment completed `payment_completed` | The transaction completes (instant card / QR completion, manual completion, matching / excess deposit, late deposit; subscription charges excluded) | Customer |
| Refund completed `refund_completed` | A refund is approved and completed | Customer |
| Top-up request `deposit_short` | “Mark top-up requested” is used on a short deposit | Customer |
| Statement `statement` | Settlement statements (manual use) | Merchant |
| Admin invitation `admin_invite` | An operator is invited | Operator |
| Subscription failed / suspended `subscription_failed` / `subscription_suspended` | A recurring charge fails / the subscription is suspended after three failures | Customer |
| Notification centre `notification` | Operators who chose e-mail for a notification kind | Operator |
| Merchant payment notice `merchant_payment_notice` | A transaction completes for a merchant whose e-mail notification setting is **every payment** | Merchant (contact e-mail) |
| Merchant daily summary `merchant_daily_summary` | 09:00 JST, the previous day, for merchants set to **daily digest** (one per environment; nothing on a day without transactions) | Merchant (contact e-mail) |

- Each template exists in Japanese and English. Customer emails default to Japanese (`EMAIL_DEFAULT_LANG=en` switches to English); the invitation uses the UI language of the inviting operator.
- The editor changes subject and body, inserts **placeholders** with a click and shows a preview rendered with sample values. Editing requires the **master role**.
- A **disabled** template produces no email for its event.

### Placeholders

`{{merchantName}}` merchant name / `{{customerName}}` customer / `{{amount}}` amount / `{{transferId}}` transfer ID / `{{deadline}}` transfer deadline / `{{transactionId}}` transaction ID / `{{orderNumber}}` order number / `{{productName}}` product / `{{shortAmount}}` short amount / `{{loginId}}` login ID / `{{initialPassword}}` initial password / `{{loginUrl}}` login URL / `{{receiptNo}}` receipt number / `{{cvsBrand}}` store / `{{planName}}` billing plan / `{{retryDate}}` retry date / `{{title}}` `{{body}}` `{{link}}` notification content / `{{paymentMethod}}` payment method / `{{completedAt}}` completed at / `{{mode}}` environment / `{{date}}` day covered / `{{completedCount}}` `{{completedAmount}}` completed count and amount / `{{methodBreakdown}}` per-method breakdown / `{{failedCount}}` `{{expiredCount}}` failed and expired counts

## Email log

Every produced email is stored with recipient, template, language, subject, rendered body, status and the related transaction. Filter by template, status, recipient and period; export as CSV.

- **The demo never sends email**: messages are stored with status “Demo (not sent)”.
- Sending is centralised in one function (`lib/email/send.ts`); the `EMAIL_PROVIDER` environment variable selects the provider (default `log` = record only, `console` = print to the server log). Connect a real delivery service by adding a provider to that function.
- Transactions without a customer email address produce no email.
