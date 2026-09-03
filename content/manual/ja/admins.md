# 管理者・操作ログ・検索

この章では、管理画面を操作する **管理者アカウント**、すべての変更を記録する **操作ログ**、ヘッダーの **横断検索** を説明します。

## ログインと権限

- ログインは **ログインID + パスワード** です。トップページを開くとログイン画面が表示され、ログイン後は 12 時間セッションが維持されます（Cookie は HMAC 署名付き。サーバーは毎回ユーザー行を再確認するため、無効化は即時に反映されます）。
- 権限（マスター / 一般）はアカウントに紐づき、画面上の切り替えはありません。機能ごとの可否は [はじめに](/manual/intro) の **権限マトリクス** を参照してください。マスター限定 API は 403（`role_required`）、未ログインの更新は 401 を返します。

## 管理者管理（設定 → 管理者管理、マスターのみ）

- **招待**: ログインID・氏名・メールアドレス・権限を入力すると、初期パスワードが **一度だけ画面に表示** されます（メールは送信ログに記録）。招待したアカウントは「招待中」で、本人が初回ログインすると「有効」になります。
- **編集**: 氏名・メールアドレス・権限・有効/無効を変更できます。ログインIDは変更できません。自分自身の権限・ステータスは変更できず、**最後の有効なマスター** を無効化・降格することもできません。
- **仮パスワードを再発行**: 対象ユーザーの新しいパスワードを発行し、一度だけ表示します。
- **二段階認証を解除**: 端末を紛失したユーザーの二段階認証を解除します。本人が再登録できます。

## アカウント設定（右上の氏名 → アカウント設定）

- **パスワード変更**: 現在のパスワードを確認のうえ、8 文字以上の新しいパスワードに変更します。
- **二段階認証（TOTP / RFC 6238）**: 「認証アプリを登録する」で QR コードと手入力用キーが表示されます。Google Authenticator などで読み取り、アプリに表示された 6 桁コードを入力すると有効になります。以降のログインでは、パスワードのあとにコードを求められます（コードの有効期限は 5 分、前後 30 秒のずれを許容）。解除にはパスワードの再入力が必要です。

## 操作ログ（設定 → 操作ログ）

データを変更する操作はすべて **同じトランザクション内で** 記録されます: 誰が（管理者、または システム / Webhook / 入金通知（銀行）/ Cron / 初期データ）、いつ、どの操作を、何に対して、接続元 IP はどこか、そして **変更前 / 変更後** の値です。パスワード・認証情報・API キー・署名シークレットなどの機微な項目は `[redacted]` として記録されます。

- 一覧は操作者・操作種別・対象種別・期間で絞り込め、列見出しで並べ替え、**CSV 出力** できます。
- 行をクリックすると詳細が開き、変更前後の値が項目ごとに並び、変わった項目が強調表示されます。

記録される操作（`操作種別` の値）:

| 領域 | 操作 |
|---|---|
| 認証・アカウント | `auth.login`, `auth.logout`, `account.password_change`, `account.totp_enable`, `account.totp_disable` |
| 管理者 | `admin.create`, `admin.update`, `admin.password_reset`, `admin.totp_reset` |
| 加盟店 | `merchant.create`, `merchant.update`, `merchant.password_regenerate`, `merchant.fee_update`, `merchant.limit_update`, `merchant.terms_update`, `merchant.settlement_update`, `api_key.issue`, `api_key.rotate`, `api_key.revoke` |
| 代理店 | `agent.create`, `agent.update` |
| 取引 | `payment.create`, `payment.capture`, `payment.cancel`, `payment.refund`, `payment.fail`, `payment.expire`, `payment.deposit`, `payment.chargeback`, `payment.deposit_diff_update` |
| 返金 | `refund.request`, `refund.approve`, `refund.reject` |
| 精算 | `settlement.generate`, `settlement.confirm`, `settlement.schedule`, `settlement.pay`, `settlement.hold`, `settlement.release`, `settlement.delete` |
| Webhook | `webhook.resend` |
| リスク | `chargeback.create`, `chargeback.dispute`, `chargeback.resolve`, `chargeback.confirm`, `blacklist.create`, `blacklist.update`, `risk.settings_update` |
| 通知・配信 | `email_template.update`, `announcement.create`, `announcement.update`, `announcement.publish`, `announcement.end`, `announcement.add_update` |
| 定期課金・決済リンク | `plan.create`, `plan.update`, `subscription.create`, `subscription.charge`, `subscription.pause`, `subscription.resume`, `subscription.cancel`, `payment_link.create`, `payment_link.disable` |
| 設定 | `provider.create`, `provider.update`, `provider.delete`, `ip_restriction.create`, `ip_restriction.update`, `ip_restriction.delete`, `demo.reset` |

## 横断検索

ヘッダーの検索ボックス（**Ctrl+K / Cmd+K** でフォーカス）に 2 文字以上入力すると、取引（取引ID・注文番号・振込ID・ユーザーID・メールアドレス・ユーザー名・カード下 4 桁）、加盟店（加盟店ID・サイト名・会社名・メール）、代理店（代理店ID・名称・会社名・メール）、管理者（マスターのみ）をまとめて検索し、カテゴリ別に表示します。Enter ですべての結果を一覧するページに移動します。
