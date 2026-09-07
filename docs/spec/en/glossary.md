# Wire Pay Specification Glossary (English–Japanese)

| Item | Value |
|---|---|
| Version | 1.1.0 |
| Target system | commit `cf1c153` (`main`) |
| Date / revised | 2026-09-06 / 2026-09-07 (rows added or changed in 1.1.0 say "1.1.0" in the definition) |

This glossary fixes the terminology used in Specifications A and B (Japanese and English editions). DB / API values are the literal strings used by the implementation; UI labels come from the dictionaries (`lib/i18n/messages/ja.ts` / `en.ts`). It includes the fixed term pairs from `CLAUDE.md`.

## 1. Parties and roles

| English | Japanese | DB / API value | Definition |
|---|---|---|---|
| PSP (payment service provider) | 決済代行（PSP） | — | The operator of Wire Pay that offers payment services to merchants. Written "Wire Pay" or "the PSP" |
| Merchant | 加盟店 | `Merchant` | An e-commerce business contracted with Wire Pay to accept payments |
| Merchant ID | 加盟店ID | `merchantCode` (`MER-00001`) | Auto-numbered public identifier |
| Agent | 代理店 | `Agent` (`AGT-00001`) | A business that refers / brokers merchants |
| Customer | 購入者（ユーザー） | `customerName` / `customerId` / `Customer` | The person paying on the merchant's site; "user" on a transaction, "customer" in the customer master |
| Customer id | ユーザーID | `customerId` / `Customer.externalId` | The merchant's own identifier of the customer |
| Admin user | 管理者 | `AdminUser` | An operator of the PSP dashboard |
| Master | マスター | `admin` (formerly `master`) | The all-permissions role; written "admin" in the specs |
| General | 一般 | `cs` (formerly `general`) | The customer-support role; written "cs" in the specs |
| Role | ロール | `admin` / `accounting` / `cs` / `developer` / `viewer` | Operator permission groups |
| Payment provider | 決済プロバイダ | `PaymentProvider` | Connection settings for a party Wire Pay entrusts processing to |
| Downstream PSP / wallet | 下位 PSP・ウォレット | — | A business that calls Wire Pay's API as a client (reader of Specification A) |
| Upstream PSP / wallet | 上位 PSP・ウォレット | — | A business Wire Pay entrusts processing to (reader of Specification B) |
| Acquirer | アクワイアラ | — | Card merchant-acquiring bank |
| Konbini payment collection agency | コンビニ収納代行 | — | Collection business for convenience-store counter payments |
| Virtual account | バーチャル口座 | `virtual_account` | Bank service issuing a transfer account per order |

## 2. Transactions and lifecycle

| English | Japanese | DB / API value | Definition |
|---|---|---|---|
| Transaction | 取引 | `Payment` | One payment record from creation to completion, refund or expiry |
| Payment application | 決済申請 | `APPLICATION_STATUSES` | Name / list of transactions not yet completed (plus failed, expired, cancelled) |
| Payments (sales) | 決済一覧（売上） | `SALES_STATUSES` | List of completed, refunded and charged-back transactions |
| Transaction ID | 取引ID | `Payment.id` / webhook `payment_id` | Unique identifier issued by Wire Pay |
| Provider transaction ID | トランザクションID（プロバイダ側） | `Payment.externalId` / webhook `transaction_id` | The provider-side identifier |
| Order number | 注文番号 | `orderNumber` | The merchant's order number |
| Payment method | 決済手段 / 決済種別 | `method`: `credit` / `qr` / `convenience` / `bank` / `other` | |
| Credit card payments | クレジットカード決済 | `credit` | |
| QR code payments | QR コード決済 | `qr` | |
| Konbini payments | コンビニ決済 | `convenience` | Convenience-store counter payments |
| Bank transfer payments | 銀行振込決済 | `bank` | |
| Other web payment services | その他 Web サービス決済 | `other` | |
| Pending | 申請中 | `pending` | Just created (the English label changed from "Applied" to "Pending" in 1.1.0) |
| Awaiting payment (konbini) | 支払待ち（コンビニ） | `awaiting_payment` | Receipt number issued, waiting for the counter payment (its own status since 1.1.0; previously `pending` + `cvsReceiptNo`) |
| Waiting for money | 入金待ち | `WAITING_STATUSES`: `awaiting_transfer` / `awaiting_payment` | Statuses that carry a deadline (`transferDueAt`) (1.1.0) |
| Awaiting transfer | 振込待ち | `awaiting_transfer` | Transfer ID issued, waiting for the deposit |
| Authorization / Authorized | 与信 / 与信済 | `authorized` | Funds reserved |
| Capture / Completed | 売上確定 / 完了 | `captured`, action `capture` | Payment settled |
| Partially refunded | 一部返金 | `partially_refunded` | |
| Refunded | 返金済 | `refunded` | |
| Void / Cancelled | 取消 / キャンセル | `cancelled`, action `cancel` | Abandoning a transaction before completion; UI label "Cancelled" |
| Failed | 失敗 | `failed` | |
| Expired | 期限切れ | `expired`, action `expire` | A later deposit can be applied through `late_deposit` |
| Late deposit | 期限後入金 | action `late_deposit` (`expired` → `captured`), `UnmatchedDeposit.reason = late_deposit` | A deposit that arrived after expiry, applied by the PSP with a reason (1.1.0) |
| Overdue | 期限超過 | `?overdue=1`, `overdue` flag | Past the deadline while the status is unchanged |
| Chargeback (status) | チャージバック（ステータス） | `chargeback` | A lost / confirmed dispute |
| Failure reason | 失敗理由 | `failureReason` | `limit_exceeded:*` / `blocked:*` / test-card reasons / `charge_declined` |
| Status history | ステータス変更履歴 | `PaymentEvent` | Append-only log of transitions |
| Actor | 実行者 | `dashboard` / `api` / `webhook` / `bank` / `cvs` / `system` / `seed` | Who caused a transition |
| Transition table | 状態遷移表 | `TRANSITIONS` | The single definition of allowed transitions |
| Auto-capture | 自動売上 | `autoCapture` | Complete at creation |
| Idempotency key | 冪等キー | `Idempotency-Key` / `idempotencyKey` | Prevents duplicate creation |
| Test / Live (environment) | テスト / 本番（環境） | `livemode`, `mode: test \| live`, key prefixes `wp_test_` / `wp_live_` | Data environment |
| Test card | テストカード | `TEST_CARDS` | Card numbers selecting a scenario |

## 3. Bank transfer, konbini and deposits

| English | Japanese | DB / API value | Definition |
|---|---|---|---|
| Transfer ID | 振込ID | `transferId` | 7- or 8-digit matching number |
| Transfer ID length | 振込IDの桁数 | `transferIdDigits` | 7 or 8 |
| Transfer deadline | 振込期限 | `transferDueAt` / `transferDueDays` | Default 7 days |
| Transfer instructions | 振込案内 | e-mail `transfer_guide` | |
| Receipt number (konbini) | 受付番号 | `cvsReceiptNo` | 13 digits |
| Store (konbini brand) | 支払店舗 | `cvsBrand`: `seven` / `lawson` / `familymart` / `ministop` / `other` | |
| Payment deadline (konbini) | 支払期限（コンビニ） | `transferDueAt` / `cvsDueDays` | Default 3 days |
| Paid at | 支払日時 | `cvsPaidAt` | |
| Deposit | 入金 | action `deposit` | Money received from a bank / konbini |
| Deposit notification | 入金通知 | `/api/demo/deposit-notify`, `/api/demo/cvs-notify` | Notification from a bank / konbini network; `mode` mandatory, `eventId` optional (1.1.0) |
| Deposit notification log | 入金通知ログ | `DepositNotification` (`DN-00001`), `/deposit-notifications` | Record of every received notification; result `applied` / `duplicate` / `unmatched` / `rejected` (1.1.0) |
| De-duplication key | 重複排除キー | `dedupeKey` / `claimKey` | `eventId` or a content hash; a resend with the same key is not re-applied (1.1.0) |
| Environment mismatch | 環境不一致 | `mode_mismatch` | A deposit whose `mode` differs from the transaction's `livemode` (held as unmatched, 1.1.0) |
| Deposit reconciliation | 入金消込 | `reconcileDeposit` | Matching a deposit to a transaction |
| Deposited amount (total) | 入金額（累計） | `depositAmount` | |
| Short / excess deposit | 過不足入金 | `depositDiff`: `short` / `excess` | |
| Short | 不足 | `short` | total < amount due |
| Excess | 超過 | `excess` | total > amount due |
| Follow-up status | 対応状況（過不足） | `depositDiffStatus`: `open` / `refund_arranged` / `notified` / `resolved` | |
| Additional deposit request | 追加入金案内 | e-mail `deposit_short` | |
| Unmatched deposit | 未消込入金 | `UnmatchedDeposit`: `unmatched` / `matched` / `dismissed`; `source`: `bank` / `cvs` / `manual` | Holding place for deposits with an unknown transfer ID, late, after cancellation, or in the wrong environment |
| Hold reason | 保留理由 | `reason`: `late_deposit` / `cancelled_deposit` / `mode_mismatch` | Why the deposit became unmatched (1.1.0) |
| Match (attach transfer ID) | 振込IDを付与して消込 | `POST .../match` | |
| Apply as late deposit | 期限後入金として消込 | `POST .../late-match` (reason required) | Runs the `late_deposit` transition (1.1.0) |
| Dismiss | 却下 | `dismissed`, `dismissKind`: `returned` / `other` | |
| Return (of a deposit) | 組戻し | `dismissKind = returned` | Sending the money back to the payer (funds move outside the system, 1.1.0) |
| API re-notify | API 再通知 | `POST /api/payments/{id}/renotify` | Re-send `payment.completed` |
| Payout | 入金（PSP → 加盟店） | `SettlementBatch` | Settlement payment to the merchant |

## 4. Refunds and chargebacks

| English | Japanese | DB / API value | Definition |
|---|---|---|---|
| Refund | 返金 | `Refund` | Returning money on a completed transaction |
| Refund request | 返金申請 | `requested` | Filed by a merchant or the PSP |
| Approve / Reject | 承認 / 否認 | `approved` / `rejected`, `/approve` / `/reject` | PSP review |
| Refund window | 返金可能期限 | `refundWindowDays` | Default 180 days |
| Forced refund | 強制返金 | `forced` | Admin refund after the window |
| Refund reason | 返金理由 | `customer` / `defect` / `duplicate` / `other` | Customer request / Defective goods / Duplicate payment / Other |
| Full / Partial | 全額 / 一部 | `kind`: `full` / `partial` | |
| Refundable balance | 返金可能残額 | — | amount − refunded − pending requests |
| Chargeback | チャージバック | `Chargeback` | Payment dispute |
| Received / Disputed / Won / Lost / Confirmed | 受付 / 異議申立中 / 勝訴 / 敗訴 / 確定 | `received` / `disputed` / `won` / `lost` / `confirmed` | |
| Dispute deadline | 異議申立期限 | `disputeDeadlineAt` | Default 14 days |
| Reason code (chargeback) | 理由コード（CB） | `fraud` / `not_received` / `not_as_described` / `duplicate` / `other` | Fraud / Not received / Not as described / Duplicate / Other |
| Evidence note | 証憑メモ | `evidenceNote` | |

## 5. Settlement and invoicing

| English | Japanese | DB / API value | Definition |
|---|---|---|---|
| Settlement | 精算 | `SettlementBatch` | Payout calculation for a merchant |
| Settlement batch | 精算バッチ | `SettlementBatch` | One per merchant × period × environment |
| Settlement line | 明細行 | `SettlementLine`: `payment` / `refund` / `chargeback` | |
| Settlement cycle | 締めサイクル | `settlementCycle`: `monthly` / `semimonthly` / `weekly` | Month-end / 15th and month-end / weekly |
| Payout term | 支払サイト | `payoutTerm`: `next_month_end` / `next_month_15` / `month_after_next_15` / `next_week` | |
| Scheduled payout date / Paid at | 振込予定日 / 振込完了日 | `scheduledAt` / `paidAt` | |
| Collecting / Confirmed / Scheduled / Paid / Held | 集計中 / 確定 / 振込予定 / 振込済 / 保留 | `collecting` / `confirmed` / `scheduled` / `paid` / `held` | |
| Gross sales | 売上総額 | `grossAmount` | |
| Fee (total) | 手数料（合計） | `feeAmount` | Wire Pay → merchant payment fees |
| Fee rate / Fixed fee | 手数料率 / 固定手数料 | `ratePercent` / `fixedFee` | |
| Contract plan | 契約プラン | `plan`: `standard` / `premium` / `custom` | |
| Settlement fee (transfer fee) | 精算手数料（振込手数料） | `settlementFee` | |
| Net payout | 差引支払額 | `netAmount` | |
| Qualified invoice | 適格請求書（インボイス） | `GET .../invoice` | Invoice PDF for the payment fees |
| Invoice number | 請求書番号 | `SettlementBatch.invoiceNo`: `INV-YYYYMM-<merchant number>-<2-digit sequence>` | Assigned and stored when the batch is confirmed (1.1.0; the old format had no sequence) |
| Registration number | 登録番号 | `issuerRegistrationNo` / `invoiceNumber` (`T` + 13 digits) | Qualified-invoice issuer number |
| Tax category | 税区分 | `taxCategory`: `standard10` / `reduced8` / `exempt` | |
| Tax rounding | 端数処理 | `taxRounding`: `floor` / `round` / `ceil` | |
| Receipt | 領収書 | `Receipt` (`RC-YYYYMM-00001`), `source`: `dashboard` / `customer` / `merchant` | Customer receipt PDF; also issued from the merchant portal (1.1.0) |
| Addressee / Description | 宛名 / 但し書き | `recipientName` / `description` | Receipt wording (description added in 1.1.0) |
| Re-issue | 再発行 | `reissueCount` | |
| Agent fee | 代理店手数料 | — | `floor(net payout × fee rate)` |

## 6. Webhooks, API and authentication

| English | Japanese | DB / API value | Definition |
|---|---|---|---|
| Merchant webhook | Webhook（加盟店向け通知） | `WebhookDelivery` | HTTP notification Wire Pay → merchant |
| Webhook delivery log | Webhook 送信ログ | `WebhookDelivery` / `WebhookAttempt` | |
| Notification URL | システム通知先 URL | `notifyUrl` | The merchant's receiving endpoint |
| Notification format | 通知の型 | `notifyFormat`: `json_post` / `form_post` / `query_get` | |
| Parameter set | 送信パラメータセット | `notifyParamSet`: `minimal` / `standard` / `full` | |
| Identifier format | 決済識別子の形式 | `notifyIdFormat`: `payment_id` / `transaction_id` / `both` | |
| Signature | 署名 | `X-Signature` / `Wirepay-Signature` | HMAC-SHA256 |
| Signing secret | 署名シークレット | `ApiKey.kind = signing_secret` (`wp_*_ss_`) | Webhook signing key; no delivery to an environment without one (fail closed); the test secret is issued at merchant registration (1.1.0) |
| Signing secret missing | 署名鍵なし | `signing_secret_missing`, notification `webhook.signing_secret_missing` | A webhook that could not be sent for lack of a signing secret (1.1.0) |
| API key | API キー | `ApiKey.kind = api_key` (`wp_*_ak_`) | Bearer credential |
| Issue / Rotate / Revoke | 発行 / ローテーション / 失効 | `api_key.issue` / `rotate` / `revoke` | |
| Grace period | 猶予期間 | `ROTATION_GRACE_DAYS` = 7 | Overlap of old and new key |
| Active / Expiring / Expired / Revoked | 有効 / 失効予定 / 期限切れ / 失効 | `active` / `expiring` / `expired` / `revoked` | Key states |
| Pending / Success / Retrying / Failed / Abandoned | 送信待ち / 成功 / リトライ待ち / 失敗 / 断念 | `pending` / `success` / `retrying` / `failed` / `abandoned` | Delivery states |
| Resend / Retry | 再送 | `webhook.resend` | Manual resend / automatic retry |
| Result notification (provider webhook) | 結果通知（プロバイダ → Wire Pay） | `WebhookEvent`, `/api/webhooks/{providerId}` | |
| Simulate webhook | Webhook をシミュレート | `/api/payments/{id}/simulate-webhook` | Signed self-delivery test |
| Public API | 公開 API | `/api/v1` | Merchant-facing REST API |
| Merchant API | 加盟店 API | `/api/merchant-api/*` | ping / settlements / announcements |
| Merchant portal | 加盟店管理画面 | `/merchant/*`, cookie `wirepay.merchant` | Merchant login screens |
| PSP dashboard (operator dashboard) | PSP 管理画面 | under `/` | Operator screens |
| Hosted payment page | ホスト型決済ページ | `/pay/<token>` | Customer page of a payment link |
| Payment link | 決済リンク | `PaymentLink` (`active` / `disabled`) | Fixed-amount checkout by URL / QR |
| Disable | 無効化 | `disabled` | |
| Used count / Max uses | 利用回数 / 最大利用回数 | `usedCount` / `maxUses` | |
| Sandbox | サンドボックス | `/merchant/sandbox` | Console calling the real API with a test key |
| Rate limit | レート制限 | `ApiRateLimit`, 429 `rate_limited` | 60 / minute per merchant × environment, shared by the public API and the merchant API (1.1.0) |
| IP restriction | IP 制限 | `IpRestriction` | |
| Block / Allow / Allow list | ブロック / 許可 / 許可リスト | `mode`: `deny` / `allow` | Block rules always enforce; allow rules enforce while the allow-list mode is on |
| Allow-list mode | 許可リストモード | `GlobalSetting.ipAllowlistAdmin` / `ipAllowlistMerchantApi`, `PUT /api/ip-restrictions/allowlist` | Blocks callers matching no enabled allow rule (per target, default off, 1.1.0) |
| Self-lockout prevention | 自己ロックアウト防止 | 400 `ip_self_block`, `allowlist_no_rules` | Refuses settings that would lock the operator out |
| Target (IP restriction) | 対象（IP 制限） | `target`: `admin` / `merchant_api` | |
| Lockout | ロックアウト | `merchant_locked` (423) | 15 minutes after 5 failures |
| Two-factor (TOTP) | 二段階認証 | `totpEnabled` | PSP admin users only |
| Invite | 招待 | `invited` | Admin accounts |
| Audit log | 操作ログ | `AuditLog` | |
| Actor type | 操作者種別 | `admin` / `merchant` / `system` / `webhook` / `bank` / `cvs` / `cron` / `seed` | |

## 7. Risk, limits and notifications

| English | Japanese | DB / API value | Definition |
|---|---|---|---|
| Transaction limit | 限度額 | `MerchantLimit`: `perTransaction` / `daily` / `monthly` | |
| Limit exceeded | 限度額超過 | `limit_exceeded:*`, webhook `limit.exceeded` | |
| Payment method suspension | 決済手段の停止（一時停止） | `PaymentMethodControl` | Stops new checkouts only |
| Global / Per-merchant suspension | 全体停止 / 加盟店別停止 | `scope`: `global` / `merchant` | |
| Auto-resume | 自動再開 | `resumeAt` | |
| Blacklist | ブラックリスト | `Blacklist`: `card` / `ip` / `email` | |
| Candidate / Active / Disabled / Rejected | 候補 / 有効 / 無効 / 却下 | `candidate` / `active` / `disabled` / `rejected` | |
| Repeated-failure detection | 連続失敗検知 | `RiskSetting.windowMinutes` / `maxFailures` | |
| Card fingerprint | カード識別ハッシュ | `cardHash` | `sha256(brand\|last4\|expiry)` |
| Source IP | 接続元 IP | `clientIp` | |
| Stored card (payment token) | 保存カード（トークン） | `PaymentToken` | Brand, last 4, expiry |
| Customer master | 顧客マスタ | `Customer` | Merchant × customer id |
| Masking / Unmask | マスク表示 / マスク解除 | `pii.unmask` | |
| Anonymisation | 匿名化 | `anonymizedAt`, `AnonymizeBatch` | |
| Retention period | 保持期間 | `piiRetentionMonths` / `auditRetentionYears` | |
| Notification centre | 通知センター | `Notification` | Operator notifications |
| Severity | 重要度 | `info` / `warning` / `critical` | |
| Announcement | お知らせ | `Announcement`: `notice` / `maintenance` / `incident` | Notice / Maintenance / Incident |
| Occurred / Investigating / Resolved | 発生 / 対応中 / 復旧 | `occurred` / `investigating` / `resolved` | Incident timeline |
| Draft / Published / Ended | 下書き / 公開 / 終了 | `draft` / `published` / `ended` | |
| E-mail template | メールテンプレート | `EmailTemplate` (`transfer_guide`, `cvs_guide`, `payment_completed`, `refund_completed`, `deposit_short`, `statement`, `admin_invite`, `subscription_failed`, `subscription_suspended`, `notification`, `merchant_payment_notice`, `merchant_daily_summary`) | 12 keys × 2 languages |
| E-mail notification setting | メール通知設定 | `emailNotification`: `per_payment` / `daily` / `none` | Merchant-facing payment mail, sent to the contact e-mail (implemented in 1.1.0) |
| Merchant payment notice / Daily summary | 加盟店宛決済通知 / 日次サマリー | `merchant_payment_notice` / `merchant_daily_summary`, `/api/cron/merchant-daily-summary` | Per completion / previous-day digest (09:00 JST, 1.1.0) |
| E-mail log | 送信ログ | `EmailLog`: `sent` / `failed` / `demo` | |

## 8. Subscriptions

| English | Japanese | DB / API value | Definition |
|---|---|---|---|
| Plan | 課金プラン | `Plan`: `monthly` / `yearly` / `weekly` | |
| Subscription | 定期課金（契約） | `Subscription` | |
| Trial | 無料期間 | `trialDays`, `trialing` | |
| Active / Past due / Suspended / Cancelled | 有効 / 未払い / 停止 / 解約 | `active` / `past_due` / `suspended` / `cancelled` | |
| Next charge date | 次回課金日 | `nextChargeAt` | |
| Retry | 再試行 | `RETRY_DAYS` = [3, 7] | |
| Charge now / Pause / Resume / Cancel | 今すぐ課金 / 一時停止 / 再開 / 解約 | `charge` / `pause` / `resume` / `cancel` | |
| Demo charge failure rate | デモの課金失敗率 | `demoChargeFailPercent` | |

## 9. Operations and system

| English | Japanese | DB / API value | Definition |
|---|---|---|---|
| Cron job | cron | `/api/cron/*` | Scheduled processing |
| Demo mode | デモモード | — | No calls to external payment networks |
| Demo limit | デモ上限 | `DEMO_LIMITS`, `demo_limit` | |
| Read-only demo | 読み取り専用デモ | `DEMO_READONLY` | |
| Encryption key | 暗号鍵 | `ENCRYPTION_KEY` | AES-256-GCM |
| Fail-closed | fail-closed | — | Production refuses to run without the key |
| Global settings | 全体設定 | `GlobalSetting` | |
| Mode indication (live stripe) | モード表示（本番ストライプ） | `data-testid="current-mode"` / `live-stripe` | The mode badge next to page titles and the red stripe in live mode (1.1.0) |
| Admin manual | 管理画面マニュアル | `/manual/*` | |
| API docs | API ドキュメント | `/docs/api/*` | |
| Business time zone | 業務タイムゾーン | `Asia/Tokyo` | Date boundaries |
