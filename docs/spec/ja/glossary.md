# Wire Pay 仕様書 用語集（日英対訳）

| 項目 | 内容 |
|---|---|
| 版数 | 1.0.0 |
| 対象システム | コミット `6b72a40`（`main`） |
| 作成日 | 2026-09-06 |

本用語集は仕様書A・B（日本語版・英語版）で使う用語の対訳と定義を定めます。DB 値・API 値は実装の文字列をそのまま示します。UI 表示は辞書（`lib/i18n/messages/ja.ts` / `en.ts`）の値です。`CLAUDE.md` の「決済用語の対訳（変更しないこと）」を包含します。

## 1. 主体・ロール

| 日本語 | 英語 | DB / API 値 | 定義 |
|---|---|---|---|
| 決済代行（PSP） | PSP (payment service provider) | — | Wire Pay を運用し加盟店に決済サービスを提供する事業者。本書では「Wire Pay」「PSP」と表記 |
| 加盟店 | Merchant | `Merchant` | Wire Pay と契約し決済を受け付ける EC 事業者 |
| 加盟店ID | Merchant ID | `merchantCode`（`MER-00001`） | 自動採番の公開識別子 |
| 代理店 | Agent | `Agent`（`AGT-00001`） | 加盟店を紹介・取次する事業者 |
| 購入者（ユーザー） | Customer | `customerName` / `customerId` / `Customer` | 加盟店サイトで支払う人。取引の「ユーザー」、顧客マスタの「顧客」 |
| ユーザーID | Customer id | `customerId` / `Customer.externalId` | 加盟店側の顧客識別子 |
| 管理者 | Admin user | `AdminUser` | PSP 管理画面のオペレータ |
| マスター | Master | `admin`（旧 `master`） | 全権限ロール。本仕様書では「admin」 |
| 一般 | General | `cs`（旧 `general`） | カスタマーサポートロール。本仕様書では「cs」 |
| ロール | Role | `admin` / `accounting` / `cs` / `developer` / `viewer` | PSP オペレータの権限区分 |
| 決済プロバイダ | Payment provider | `PaymentProvider` | Wire Pay が決済処理を委託する先の接続設定 |
| 下位 PSP・ウォレット | Downstream PSP / wallet | — | Wire Pay の API を呼ぶクライアント側の事業者（仕様書A の読者） |
| 上位 PSP・ウォレット | Upstream PSP / wallet | — | Wire Pay が決済を委託する先（仕様書B の読者） |
| アクワイアラ | Acquirer | — | カード加盟店契約会社 |
| コンビニ収納代行 | Konbini payment collection agency | — | コンビニ店頭支払いの収納事業者 |
| バーチャル口座 | Virtual account | `virtual_account` | 注文ごとの振込口座を提供する銀行サービス |

## 2. 取引とライフサイクル

| 日本語 | 英語 | DB / API 値 | 定義 |
|---|---|---|---|
| 取引 | Transaction | `Payment` | 決済 1 件のレコード。作成から完了・返金・失効まで |
| 決済申請 | Payment application | `APPLICATION_STATUSES` | 完了前（および失敗・期限切れ・キャンセル）の取引の呼称・一覧 |
| 決済一覧（売上） | Payments (sales) | `SALES_STATUSES` | 完了・返金・チャージバックの取引の一覧 |
| 取引ID | Transaction ID | `Payment.id` / Webhook `payment_id` | Wire Pay が発行する一意の識別子 |
| トランザクションID（プロバイダ側） | Provider transaction ID | `Payment.externalId` / Webhook `transaction_id` | プロバイダ側の取引識別子 |
| 注文番号 | Order number | `orderNumber` | 加盟店側の注文番号 |
| 決済手段 / 決済種別 | Payment method | `method`: `credit` / `qr` / `convenience` / `bank` / `other` | 支払いの手段 |
| クレジットカード決済 | Credit card payments | `credit` | |
| QR コード決済 | QR code payments | `qr` | |
| コンビニ決済 | Konbini payments | `convenience` | |
| 銀行振込決済 | Bank transfer payments | `bank` | |
| その他 Web サービス決済 | Other web payment services | `other` | |
| 申請中 | Applied | `pending` | 作成直後。コンビニでは「支払待ち」 |
| 支払待ち（コンビニ） | Awaiting payment | `pending` + `cvsReceiptNo` | 受付番号発行後、店頭支払い待ち |
| 振込待ち | Awaiting transfer | `awaiting_transfer` | 振込ID発行後、入金待ち |
| 与信 / 与信済 | Authorization / Authorized | `authorized` | 支払い枠の確保 |
| 売上確定 / 完了 | Capture / Completed | `captured`、アクション `capture` | 決済の成立 |
| 一部返金 | Partially refunded | `partially_refunded` | |
| 返金済 | Refunded | `refunded` | |
| 取消 / キャンセル | Void / Cancelled | `cancelled`、アクション `cancel` | 完了前の取りやめ。UI 表示は「キャンセル / Cancelled」 |
| 失敗 | Failed | `failed` | |
| 期限切れ | Expired | `expired`、アクション `expire` | |
| チャージバック（ステータス） | Chargeback | `chargeback` | 敗訴・確定した取引 |
| 失敗理由 | Failure reason | `failureReason` | `limit_exceeded:*` / `blocked:*` / テストカード理由 / `charge_declined` |
| ステータス変更履歴 | Status history | `PaymentEvent` | 遷移の追記ログ |
| 実行者 | Actor | `dashboard` / `api` / `webhook` / `bank` / `cvs` / `system` / `seed` | 履歴の操作主体 |
| 状態遷移表 | Transition table | `TRANSITIONS` | 唯一の遷移定義 |
| 自動売上 | Auto-capture | `autoCapture` | 作成と同時に完了にする |
| 冪等キー | Idempotency key | `Idempotency-Key` / `idempotencyKey` | 二重作成防止 |
| テスト / 本番（環境） | Test / Live (environment) | `livemode`、`mode: test \| live`、キー接頭辞 `wp_test_` / `wp_live_` | データの環境 |
| テストカード | Test card | `TEST_CARDS` | シナリオ選択用のカード番号 |

## 3. 銀行振込・コンビニ・入金

| 日本語 | 英語 | DB / API 値 | 定義 |
|---|---|---|---|
| 振込ID | Transfer ID | `transferId` | 7 / 8 桁の照合番号 |
| 振込IDの桁数 | Transfer ID length | `transferIdDigits` | 7 または 8 |
| 振込期限 | Transfer deadline | `transferDueAt` / `transferDueDays` | 既定 7 日 |
| 振込案内 | Transfer instructions | メール `transfer_guide` | |
| 受付番号 | Receipt number (konbini) | `cvsReceiptNo` | 13 桁 |
| 支払店舗 | Store (konbini brand) | `cvsBrand`: `seven` / `lawson` / `familymart` / `ministop` / `other` | |
| 支払期限（コンビニ） | Payment deadline (konbini) | `transferDueAt` / `cvsDueDays` | 既定 3 日 |
| 支払日時 | Paid at | `cvsPaidAt` | |
| 入金 | Deposit | アクション `deposit` | 銀行・コンビニからの入金 |
| 入金通知 | Deposit notification | `/api/demo/deposit-notify`、`/api/demo/cvs-notify` | 銀行・コンビニからの通知 |
| 入金消込 | Deposit reconciliation | `reconcileDeposit` | 入金と取引の突合 |
| 入金額（累計） | Deposited amount (total) | `depositAmount` | |
| 過不足入金 | Short / excess deposit | `depositDiff`: `short` / `excess` | |
| 不足 | Short | `short` | 累計 < 請求額 |
| 超過 | Excess | `excess` | 累計 > 請求額 |
| 対応状況（過不足） | Follow-up status | `depositDiffStatus`: `open` / `refund_arranged` / `notified` / `resolved` | 未対応 / 差額返金手配中 / 追加入金案内済 / 完了 |
| 追加入金案内 | Additional deposit request | メール `deposit_short` | |
| 未消込入金 | Unmatched deposit | `UnmatchedDeposit`: `unmatched` / `matched` / `dismissed` | 振込ID不明の入金 |
| 振込IDを付与して消込 | Match (attach transfer ID) | `POST .../match` | |
| 却下 | Dismiss | `dismissed` | |
| API 再通知 | API re-notify | `POST /api/payments/{id}/renotify` | `payment.completed` の再送 |
| 入金（PSP → 加盟店） | Payout | `SettlementBatch` | 精算の支払い |

## 4. 返金・チャージバック

| 日本語 | 英語 | DB / API 値 | 定義 |
|---|---|---|---|
| 返金 | Refund | `Refund` | 完了取引の代金を戻す |
| 返金申請 | Refund request | `requested` | 加盟店・PSP が申請 |
| 承認 / 否認 | Approve / Reject | `approved` / `rejected`、`/approve` / `/reject` | PSP の審査 |
| 返金可能期限 | Refund window | `refundWindowDays` | 既定 180 日 |
| 強制返金 | Forced refund | `forced` | 期限超過後の admin による返金 |
| 返金理由 | Refund reason | `customer` 顧客都合 / `defect` 商品不良 / `duplicate` 重複決済 / `other` その他 | |
| 全額 / 一部 | Full / Partial | `kind`: `full` / `partial` | |
| 返金可能残額 | Refundable balance | — | 取引額 − 返金済 − 審査待ち |
| チャージバック | Chargeback | `Chargeback` | 支払異議 |
| 受付 / 異議申立中 / 勝訴 / 敗訴 / 確定 | Received / Disputed / Won / Lost / Confirmed | `received` / `disputed` / `won` / `lost` / `confirmed` | |
| 異議申立期限 | Dispute deadline | `disputeDeadlineAt` | 既定 14 日 |
| 理由コード（CB） | Reason code | `fraud` 不正利用 / `not_received` 商品未着 / `not_as_described` 商品相違 / `duplicate` 重複請求 / `other` | |
| 証憑メモ | Evidence note | `evidenceNote` | |

## 5. 精算・請求

| 日本語 | 英語 | DB / API 値 | 定義 |
|---|---|---|---|
| 精算 | Settlement | `SettlementBatch` | 加盟店への支払計算 |
| 精算バッチ | Settlement batch | `SettlementBatch` | 加盟店 × 期間 × 環境で 1 件 |
| 明細行 | Settlement line | `SettlementLine`: `payment` 売上 / `refund` 返金 / `chargeback` | |
| 締めサイクル | Settlement cycle | `settlementCycle`: `monthly` 月末締め / `semimonthly` 15日・月末締め / `weekly` 週次締め | |
| 支払サイト | Payout term | `payoutTerm`: `next_month_end` 翌月末 / `next_month_15` 翌月15日 / `month_after_next_15` 翌々月15日 / `next_week` 翌週 | |
| 振込予定日 / 振込完了日 | Scheduled payout date / Paid at | `scheduledAt` / `paidAt` | |
| 集計中 / 確定 / 振込予定 / 振込済 / 保留 | Collecting / Confirmed / Scheduled / Paid / Held | `collecting` / `confirmed` / `scheduled` / `paid` / `held` | |
| 売上総額 | Gross sales | `grossAmount` | |
| 手数料（合計） | Fee (total) | `feeAmount` | Wire Pay → 加盟店の決済手数料 |
| 手数料率 / 固定手数料 | Fee rate / Fixed fee | `ratePercent` / `fixedFee` | |
| 契約プラン | Contract plan | `plan`: `standard` スタンダード / `premium` プレミアム / `custom` カスタム | |
| 精算手数料（振込手数料） | Settlement fee (transfer fee) | `settlementFee` | |
| 差引支払額 | Net payout | `netAmount` | |
| 適格請求書（インボイス） | Qualified invoice | `INV-YYYYMM-<番号>` | 決済手数料の請求書 PDF |
| 登録番号 | Registration number | `issuerRegistrationNo` / `invoiceNumber`（`T` + 13 桁） | 適格請求書発行事業者番号 |
| 税区分 | Tax category | `taxCategory`: `standard10` / `reduced8` / `exempt` | |
| 端数処理 | Tax rounding | `taxRounding`: `floor` / `round` / `ceil` | |
| 領収書 | Receipt | `Receipt`（`RC-YYYYMM-00001`） | 購入者向け領収書 PDF |
| 再発行 | Re-issue | `reissueCount` | |
| 代理店手数料 | Agent fee | — | `floor(差引支払額 × 手数料率)` |

## 6. Webhook・API・認証

| 日本語 | 英語 | DB / API 値 | 定義 |
|---|---|---|---|
| Webhook（加盟店向け通知） | Merchant webhook | `WebhookDelivery` | Wire Pay → 加盟店の HTTP 通知 |
| Webhook 送信ログ | Webhook delivery log | `WebhookDelivery` / `WebhookAttempt` | |
| システム通知先 URL | Notification URL | `notifyUrl` | 加盟店の受信エンドポイント |
| 通知の型 | Notification format | `notifyFormat`: `json_post` / `form_post` / `query_get` | |
| 送信パラメータセット | Parameter set | `notifyParamSet`: `minimal` 最小 / `standard` 標準 / `full` フル | |
| 決済識別子の形式 | Identifier format | `notifyIdFormat`: `payment_id` / `transaction_id` / `both` | |
| 署名 | Signature | `X-Signature` / `Wirepay-Signature` | HMAC-SHA256 |
| 署名シークレット | Signing secret | `ApiKey.kind = signing_secret`（`wp_*_ss_`） | Webhook 署名鍵 |
| API キー | API key | `ApiKey.kind = api_key`（`wp_*_ak_`） | Bearer 認証 |
| 発行 / ローテーション / 失効 | Issue / Rotate / Revoke | `api_key.issue` / `rotate` / `revoke` | |
| 猶予期間 | Grace period | `ROTATION_GRACE_DAYS` = 7 | 旧キーの併用期間 |
| 有効 / 失効予定 / 期限切れ / 失効 | Active / Expiring / Expired / Revoked | `active` / `expiring` / `expired` / `revoked` | キーの状態 |
| 送信待ち / 成功 / リトライ待ち / 失敗 / 断念 | Pending / Success / Retrying / Failed / Abandoned | `pending` / `success` / `retrying` / `failed` / `abandoned` | Webhook 送信の状態 |
| 再送 | Resend / Retry | `webhook.resend` | 手動再送 / 自動再送 |
| 結果通知（プロバイダ → Wire Pay） | Result notification (provider webhook) | `WebhookEvent`、`/api/webhooks/{providerId}` | |
| Webhook をシミュレート | Simulate webhook | `/api/payments/{id}/simulate-webhook` | 自身への署名付き送信テスト |
| 公開 API | Public API | `/api/v1` | 加盟店向け REST API |
| 加盟店 API | Merchant API | `/api/merchant-api/*` | ping / settlements / announcements |
| 加盟店管理画面 | Merchant portal | `/merchant/*`、Cookie `wirepay.merchant` | 加盟店ログイン画面 |
| PSP 管理画面 | PSP dashboard (operator dashboard) | `/` 以下 | オペレータ画面 |
| ホスト型決済ページ | Hosted payment page | `/pay/<token>` | 決済リンクの購入者向けページ |
| 決済リンク | Payment link | `PaymentLink`（`active` / `disabled`） | URL / QR で受け付ける固定金額の決済 |
| 無効化 | Disable | `disabled` | |
| 利用回数 / 最大利用回数 | Used count / Max uses | `usedCount` / `maxUses` | |
| サンドボックス | Sandbox | `/merchant/sandbox` | テストキーで実 API を呼ぶコンソール |
| レート制限 | Rate limit | `ApiRateLimit`、429 `rate_limited` | 60 回 / 分（加盟店 × 環境） |
| IP 制限 | IP restriction | `IpRestriction` | |
| ブロック / 許可 / 許可リスト | Block / Allow / Allow list | `mode`: `deny` / `allow` | ブロックのみ遮断 |
| 対象（IP 制限） | Target | `target`: `admin` 管理画面 / `merchant_api` 加盟店API | |
| ロックアウト | Lockout | `merchant_locked`（423） | 5 回失敗で 15 分 |
| 二段階認証 | Two-factor (TOTP) | `totpEnabled` | PSP 管理者のみ |
| 招待 | Invite | `invited` | 管理者アカウント |
| 操作ログ | Audit log | `AuditLog` | |
| 操作者種別 | Actor type | `admin` / `merchant` / `system` / `webhook` / `bank` / `cvs` / `cron` / `seed` | |

## 7. リスク・制限・通知

| 日本語 | 英語 | DB / API 値 | 定義 |
|---|---|---|---|
| 限度額 | Transaction limit | `MerchantLimit`: `perTransaction` / `daily` / `monthly` | 1 回 / 1 日 / 1 か月 |
| 限度額超過 | Limit exceeded | `limit_exceeded:*`、Webhook `limit.exceeded` | |
| 決済手段の停止（一時停止） | Payment method suspension | `PaymentMethodControl` | 新規受付の停止 |
| 全体停止 / 加盟店別停止 | Global / Per-merchant suspension | `scope`: `global` / `merchant` | |
| 自動再開 | Auto-resume | `resumeAt` | |
| ブラックリスト | Blacklist | `Blacklist`: `card` / `ip` / `email` | |
| 候補 / 有効 / 無効 / 却下 | Candidate / Active / Disabled / Rejected | `candidate` / `active` / `disabled` / `rejected` | |
| 連続失敗検知 | Repeated-failure detection | `RiskSetting.windowMinutes` / `maxFailures` | |
| カード識別ハッシュ | Card fingerprint | `cardHash` | `sha256(brand\|last4\|expiry)` |
| 接続元 IP | Source IP | `clientIp` | |
| 保存カード（トークン） | Stored card (payment token) | `PaymentToken` | ブランド・下 4 桁・有効期限 |
| 顧客マスタ | Customer master | `Customer` | 加盟店 × ユーザーID |
| マスク表示 / マスク解除 | Masking / Unmask | `pii.unmask` | |
| 匿名化 | Anonymisation | `anonymizedAt`、`AnonymizeBatch` | |
| 保持期間 | Retention period | `piiRetentionMonths` / `auditRetentionYears` | |
| 通知センター | Notification centre | `Notification` | PSP 向け通知 |
| 重要度 | Severity | `info` / `warning` / `critical` | |
| お知らせ | Announcement | `Announcement`: `notice` お知らせ / `maintenance` メンテナンス / `incident` 障害 | |
| 発生 / 対応中 / 復旧 | Occurred / Investigating / Resolved | `occurred` / `investigating` / `resolved` | 障害の更新履歴 |
| 下書き / 公開 / 終了 | Draft / Published / Ended | `draft` / `published` / `ended` | |
| メールテンプレート | E-mail template | `EmailTemplate`（`transfer_guide`, `cvs_guide`, `payment_completed`, `refund_completed`, `deposit_short`, `statement`, `admin_invite`, `subscription_failed`, `subscription_suspended`, `notification`） | |
| メール通知設定 | E-mail notification setting | `emailNotification`: `per_payment` 決済ごと / `daily` 1 日まとめて / `none` 無し | 加盟店設定（現状は保存のみ） |
| 送信ログ | E-mail log | `EmailLog`: `sent` / `failed` / `demo` | |

## 8. 定期課金

| 日本語 | 英語 | DB / API 値 | 定義 |
|---|---|---|---|
| 課金プラン | Plan | `Plan`: `monthly` 月額 / `yearly` 年額 / `weekly` 週額 | |
| 定期課金（契約） | Subscription | `Subscription` | |
| 無料期間 | Trial | `trialDays`、`trialing` | |
| 有効 / 未払い / 停止 / 解約 | Active / Past due / Suspended / Cancelled | `active` / `past_due` / `suspended` / `cancelled` | |
| 次回課金日 | Next charge date | `nextChargeAt` | |
| 再試行 | Retry | `RETRY_DAYS` = [3, 7] | |
| 今すぐ課金 / 一時停止 / 再開 / 解約 | Charge now / Pause / Resume / Cancel | `charge` / `pause` / `resume` / `cancel` | |
| デモの課金失敗率 | Demo charge failure rate | `demoChargeFailPercent` | |

## 9. 運用・システム

| 日本語 | 英語 | DB / API 値 | 定義 |
|---|---|---|---|
| cron | Cron job | `/api/cron/*` | 定期処理 |
| デモモード | Demo mode | — | 外部決済ネットワークを呼ばない動作 |
| デモ上限 | Demo limit | `DEMO_LIMITS`、`demo_limit` | |
| 読み取り専用デモ | Read-only demo | `DEMO_READONLY` | |
| 暗号鍵 | Encryption key | `ENCRYPTION_KEY` | AES-256-GCM |
| fail-closed | Fail-closed | — | 鍵未設定で本番が停止する設計 |
| 全体設定 | Global settings | `GlobalSetting` | |
| 管理画面マニュアル | Admin manual | `/manual/*` | |
| API ドキュメント | API docs | `/docs/api/*` | |
| 業務タイムゾーン | Business time zone | `Asia/Tokyo` | 日付境界 |
