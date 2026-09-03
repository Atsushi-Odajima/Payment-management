# CLAUDE.md

このリポジトリで作業する際のガイド。設計判断の詳細は [README の「設計判断」](./README.md#設計判断) を正とし、ここでは作業ルールだけを書く。

## プロジェクト概要

小規模ECストア向けの決済管理ダッシュボード「Wire Pay」（デモアプリ）。
Next.js 14 App Router + TypeScript + Tailwind + Prisma(SQLite / Postgres) + Zod。
外部決済APIは呼ばないデモモードで動作し、決済はDB上のダミーレコード。

## コマンド（コミット前に `npm run verify` を通すこと）

- `npm run dev` — 開発サーバ
- `npm run verify` — lint → typecheck → check:i18n → test → build を一括実行（CI と同じ）
- `npm test` — Vitest（純関数のユニット + Route Handler 統合テスト。SQLite の `prisma/test.db` を自動作成）
- `npm run check:i18n` — 辞書・registry 以外に日本語文字が残っていないか検査
- `npm run icons:build` — ブランドアイコンの PNG を再生成（`lib/wire-pay-icon.ts` が唯一の定義）
- `npm run db:reset` — ローカルのデモ DB を全削除 → seed（`scripts/db-reset.ts`）。実機確認（`tests/smoke*.mjs`）の前に実行する
- 初回は `.env` に `DATABASE_URL` と `ENCRYPTION_KEY`（32バイトbase64）が必要。`npx prisma migrate deploy && npm run db:seed` でDB準備
- スキーマ変更は `npx prisma migrate dev --name xxx`（Docker 経路が `migrate deploy` を使うため、`db push` だけで済ませない）。本番（Vercel + Neon）は `prisma db push --accept-data-loss` で反映する（デモ DB は使い捨て）。フラグを外すと一意制約の追加のような警告だけでビルドが止まるので外さない。それでも **列の削除・型変更・NOT NULL 追加など破壊的変更は避ける**（追加は nullable か `@default` 付きで）
- seed（`prisma/seed-data.ts`）は **テーブル単位の upsert で冪等**。「データがあればスキップ」ではなく、固定 ID ごとに `upsert({ update: {} })` するので、既存 DB に新テーブルのサンプルだけを後から足せる。何度実行しても件数は増えない。新しいテーブルを足したら seed にもサンプルを追加し、`truncateAll` の削除順（子 → 親）にも加える

## アーキテクチャ・不変条件

- `app/**/page.tsx` は **Server Component**。Prisma で取得し、表示に必要な列だけを `select` して `components/views/*-view.tsx`（client）に渡す。**`credentials` 列を client に渡さない**（`providers/[id]` は `readCredentialsForDisplay` でマスク済みのみ）
- Server Component から `"use client"` モジュールの **関数や定数を import しない**（本番ビルドでは client reference になり `is not a function` で落ちる。dev では気づきにくい）。共有したいヘルパーは `lib/` に置く（例: `lib/pagination.ts` の `parsePage` / `DEFAULT_PAGE_SIZE`）。新しい画面を足したら `npm run build && npx next start` で実際に開いて確認する
- `lib/crypto.ts` を import できるのは `lib/providers/credentials.ts` だけ（ESLint `no-restricted-imports` で強制）。暗号鍵は本番で fail-closed
- 決済（取引）の状態遷移は `lib/payments/transitions.ts` の `TRANSITIONS` が唯一の定義。ステータスは `pending`（申請中）/ `awaiting_transfer`（振込待ち）/ `authorized`（与信済）/ `captured`（完了）/ `partially_refunded` / `refunded` / `cancelled` / `failed` / `expired`、アクションは `capture | cancel | refund | fail | expire | deposit`。**決済申請一覧 = `APPLICATION_STATUSES`、決済一覧 = `SALES_STATUSES`** の同一テーブル・フィルタ違い（ローダは `lib/payments/list.ts` / `detail.ts` を両画面で共用）。API/UI/Webhook は全てここから導出し、更新は `lib/payments/actions.ts` の `applyPaymentAction`（status 条件付き `updateMany` + `PaymentEvent` 記録）を通す。route に if 文で遷移ルールを書かない。権限は `requirePermission(req, "payment", "state" | "deposit")` / `("refund", "request")`（`lib/role.ts`）
- 銀行振込は `lib/payments/transfer.ts`（振込ID採番 `generateTransferId`・期限 `TRANSFER_DUE_DAYS`・消込 `reconcileDeposit`）。`deposit` は入金累計で判定し、一致 → `captured`、不足 → `awaiting_transfer` のまま `depositDiff="short"`、超過 → `captured` + `"excess"`。`expire` は `transferDueAt` 超過時のみ。`POST /api/demo/deposit-notify`（`DEPOSIT_NOTIFY_SECRET`）は同じ `applyPaymentAction` を actor `bank` で呼ぶ
- API レスポンスは `{ ok: true, data }` / `{ ok: false, error: { code, message } }` に統一（`lib/api/handler.ts` の `withApiHandler` でラップ）。client は `useApiJson()` を使う
- `/api/*` の非 GET は `middleware.ts` で rate limit → CSRF（Origin + `X-Requested-With: fetch`）→ `DEMO_READONLY` → セッション（署名と期限のみ）、の順に検査。Webhook（署名）、`/api/demo/reset`（`CRON_SECRET`）、`/api/demo/deposit-notify` は独自認証。route 側は `lib/admin/current.ts` でユーザー行を再確認する（無効化の即時反映）
- **データを変更する処理は必ず `lib/audit.ts` の `recordAudit` を同一トランザクション内で呼ぶ**（actor は `auditContextFromRequest(req)` / `systemAuditContext("webhook"|"bank"|"cron")`）。新しい操作は `AUDIT_ACTIONS` と辞書 `auditEnums.action.*`（`.` を `_` に置換）に追加する。機微な列は `redactForAudit` が `[redacted]` にする
- 一覧画面は `components/data-table.tsx`（列定義・ソート・ページング・CSV）を使う。並び替えは `lib/query.ts` の `parseSort` でクエリ駆動、CSV は各 API の `?format=csv`（`lib/csv.ts`、上限 `CSV_MAX_ROWS`）。既存一覧（取引・加盟店・代理店・IP制限）は順次移行する
- 決済履歴は帳簿として扱う: プロバイダの `onDelete: Restrict`、決済を持つプロバイダは削除ではなく無効化。`livemode` は作成時にスナップショット

## 加盟店（Merchant）データと権限

- モデルは `prisma/schema.prisma` の `Merchant`。列: `merchantCode`（`MER-00001` 形式・自動採番・**変更不可**）, `passwordEnc`（AES-GCM 暗号化。**client に渡さない**。`app/api/merchants/select.ts` の `MERCHANT_SELECT` を使う）, `siteName`, `siteNameKana`（全角カタカナのみ）, `companyName`, `contactName`, `email`, `statementEmail`, `notifyUrl`（https 必須）, `notifyFormat`（`json_post | form_post | query_get`）, `notifyParamSet`（`minimal | standard | full`）, `notifyIdFormat`（`payment_id | transaction_id | both`）, `emailNotification`（`per_payment | daily | none`）
- 語彙と型ガードは `lib/merchants/types.ts`、検証は `lib/merchants/schema.ts`（フォームと API で同じ Zod。エラーは `merchantForm.errors.*` のコード）、採番は `lib/merchants/ids.ts`、パスワード生成/暗号化は `lib/merchants/secrets.ts`（`lib/crypto` を import してよい2つ目のモジュール）
- 通知サンプルは `lib/merchants/notification.ts` の `buildNotificationSample` が唯一の定義。README の仕様と一致させること
- `agentId`（任意）で担当代理店（`Agent`）を参照（`onDelete: SetNull`）。`enabledMethods` は利用可能な決済手段の JSON 配列（`lib/payments/methods.ts` の `PAYMENT_METHODS`、フォームのチェックボックスで編集）、`transferIdDigits`（7 | 8）は銀行振込の振込IDの桁数。`app/api/merchants/select.ts` の `toMerchantData` / `serialize` で JSON ⇄ 配列を変換する
- **権限**: ロールは `AdminUser.role`（`lib/role.ts` の `ROLES`: admin / accounting / cs / developer / viewer）で、セッション Cookie（`lib/auth.ts`、HMAC 署名、`{ sub, role, purpose, exp }`）から `lib/admin/current.ts` が解決する（旧 master / general は `normalizeRole` で読み替え）。client には `components/session-provider.tsx` の `useSession()` / `useRole().can` / `useCan(resource, action)` で配布（UI の出し分け専用）。API は **`lib/api/role-guard.ts` の `await requirePermission(req, resource, action)`**（401 / 403 `permission_required`）、ログイン必須だけなら `await requireAdmin(req)`。ページ側は `lib/admin/page-guard.ts` の `requireAdminPage` / `requirePermissionPage`。route に cookie 解析を直接書かない

## 管理者・監査ログ・検索・ナビ（フェーズA）

- **AdminUser**: `loginId`（@unique・小文字正規化・変更不可）, `name`, `email`（@unique）, `role`, `status`（`active | disabled | invited`。招待直後は invited、初回ログインで active）, `passwordHash`（scrypt、`lib/admin/password.ts`）, `totpSecretEnc`（AES-GCM、`lib/admin/secrets.ts` が `lib/crypto` を import してよい3つ目のモジュール）, `totpEnabled`, `lastLoginAt`。Zod は `lib/admin/schema.ts`、client に渡す列は `lib/admin/select.ts` の `ADMIN_SELECT`（ハッシュ・シークレットは絶対に返さない）
- **ログイン**: `POST /api/auth/login`（ID + パスワード）→ 2FA 有効なら `wirepay.2fa` Cookie（5 分、purpose `2fa`）を返し `POST /api/auth/2fa` で 6 桁コード → `lib/admin/session.ts` の `issueSession` がセッション Cookie（12 時間）と `auth.login` の監査を書く。TOTP は `otpauth`（RFC 6238、±1 ステップ許容）、QR は `uqr`（SVG）。`/account` で本人がパスワード変更・2FA 登録/解除、`/admins`（マスター）で招待（初期パスワードを 1 回だけ返す）・編集・仮パスワード再発行・2FA 解除。`lib/admin/guards.ts`: 自分自身の権限/ステータス変更と最後のマスターの無効化・降格を拒否
- **デモアカウント**は `prisma/seed-accounts.ts`（admin `kuromaru` / cs `general` / `accounting` / `developer` / `viewer`）。`DEMO_LOGIN_HINT` を設定するとログイン画面に表示。`ADMIN_PASSWORD` は使わなくなった
- **AuditLog**: `actorType`（`admin | system | webhook | bank | cron | seed`）, `actorId?`, `action`, `targetType`, `targetId`, `before` / `after`（redact 済み JSON 文字列）, `ip`。一覧 `/audit-logs`（`lib/audit-list.ts`、絞り込み: 操作者・操作種別・対象種別・期間、CSV）、詳細は変更前後を並べて差分強調
- **横断検索**: `lib/search.ts` の `searchAll` を `GET /api/search`（ヘッダーの `SearchBox`、Ctrl/Cmd+K）と `/search` ページで共用。管理者はマスターのみ検索対象。カード下4桁はフェーズFで追加
- **ナビ**: `lib/nav.ts` の `NAV_GROUPS`（取引 / 加盟店 / 精算 / リスク / レポート / 配信 / 設定）が唯一の定義。サイドバー・モバイルタブ（`MOBILE_TABS`）・トップページのカードはここから生成し、`implemented: false` の項目は非表示。新フェーズで画面を実装したら該当項目を `implemented: true` にし、`dashboard.cards.<key>` の説明と KPI（`components/views/dashboard-view.tsx` の `figure`）を足す。ラベルは `nav.groups.*` / `nav.items.*`
- トップページ（`app/page.tsx`）は未ログインなら `/login` にリダイレクト（ログインを求めるのはこの入口だけ。他画面の閲覧は従来どおり公開、更新はセッション必須）。各画面の `PageHeader` には `helpHref="/manual/<chapter>"` で該当章への「?」リンクを付ける。

### 権限マトリクス

**唯一のソースは `lib/role.ts` の `PERMISSIONS`**（リソース × アクション × ロール）。下の表と `content/manual/{ja,en}/intro.md` の表は `npx tsx scripts/gen-permissions.ts` で生成する（手で編集しない）。ロールは `admin`（全権限、旧 master）/ `accounting` / `cs`（旧 general）/ `developer` / `viewer`。API は `requirePermission(req, resource, action)`、ページは `requirePermissionPage`、client は `useCan` / `useRole().can` を使い、`isMaster` は廃止。未ログインは閲覧のみ（トップページは要ログイン）。`DEMO_READONLY=1` では削除とプロバイダの PATCH が全員 403。

<!-- permissions:start -->
| 機能 | 操作 | admin | accounting | cs | developer | viewer |
|---|---|---|---|---|---|---|
| 加盟店 | 閲覧 | ○ | ○ | ○ | ○ | ○ |
| 加盟店 | 作成 | ○ |  | ○ |  |  |
| 加盟店 | 更新 | ○ |  | ○ |  |  |
| 加盟店 | パスワード表示 | ○ |  |  |  |  |
| 加盟店 | パスワード再発行 | ○ |  |  |  |  |
| 契約・手数料 / 限度額 / 期限 / 精算設定 | 閲覧 | ○ | ○ | ○ | ○ | ○ |
| 契約・手数料 / 限度額 / 期限 / 精算設定 | 更新 | ○ | ○ |  |  |  |
| API キー・署名シークレット | 閲覧 | ○ | ○ | ○ | ○ | ○ |
| API キー・署名シークレット | 発行 | ○ |  |  | ○ |  |
| API キー・署名シークレット | ローテーション | ○ |  |  | ○ |  |
| API キー・署名シークレット | 失効 | ○ |  |  | ○ |  |
| 代理店 | 閲覧 | ○ | ○ | ○ | ○ | ○ |
| 代理店 | 作成 | ○ |  | ○ |  |  |
| 代理店 | 更新 | ○ |  | ○ |  |  |
| 取引 | 閲覧 | ○ | ○ | ○ | ○ | ○ |
| 取引 | 作成 | ○ |  | ○ |  |  |
| 取引 | 完了 / 失敗 / キャンセル / 期限切れ | ○ |  |  |  |  |
| 取引 | 入金消込 | ○ | ○ |  |  |  |
| 取引 | API 再通知 | ○ |  | ○ | ○ |  |
| 取引 | Webhook シミュレート | ○ |  |  | ○ |  |
| 取引メモ | 閲覧 | ○ | ○ | ○ | ○ | ○ |
| 取引メモ | 作成 | ○ | ○ | ○ | ○ |  |
| 取引メモ | 自分の投稿を編集 | ○ | ○ | ○ | ○ |  |
| 取引メモ | 削除 | ○ |  |  |  |  |
| 取引メモ | ピン留め | ○ |  | ○ |  |  |
| 未消込入金 | 閲覧 | ○ | ○ | ○ | ○ | ○ |
| 未消込入金 | 登録 | ○ | ○ | ○ |  |  |
| 未消込入金 | 消込 | ○ | ○ |  |  |  |
| 未消込入金 | 却下 | ○ | ○ | ○ |  |  |
| 過不足入金 | 閲覧 | ○ | ○ | ○ | ○ | ○ |
| 過不足入金 | 更新 | ○ | ○ | ○ |  |  |
| 返金 | 閲覧 | ○ | ○ | ○ | ○ | ○ |
| 返金 | 申請 | ○ |  | ○ |  |  |
| 返金 | 期限超過の強制 | ○ |  |  |  |  |
| 返金 | 承認 / 否認 | ○ | ○ |  |  |  |
| 領収書 | 閲覧 | ○ | ○ | ○ | ○ | ○ |
| 領収書 | 発行 | ○ | ○ | ○ |  |  |
| 精算バッチ | 閲覧 | ○ | ○ | ○ | ○ | ○ |
| 精算バッチ | 生成 | ○ | ○ |  |  |  |
| 精算バッチ | 確定 / 振込予定 / 振込済 / 保留 / 解除 | ○ | ○ |  |  |  |
| 精算バッチ | 削除 | ○ | ○ |  |  |  |
| 請求書（インボイス） | 出力 | ○ | ○ |  |  |  |
| 代理店手数料 | 閲覧 | ○ | ○ | ○ | ○ | ○ |
| 集計レポート | 閲覧 | ○ | ○ | ○ | ○ | ○ |
| Webhook 送信ログ | 閲覧 | ○ | ○ | ○ | ○ | ○ |
| Webhook 送信ログ | 再送 | ○ |  |  | ○ |  |
| チャージバック | 閲覧 | ○ | ○ | ○ | ○ | ○ |
| チャージバック | 作成 | ○ | ○ |  |  |  |
| チャージバック | 更新 | ○ | ○ |  |  |  |
| ブラックリスト | 閲覧 | ○ | ○ | ○ | ○ | ○ |
| ブラックリスト | 作成 | ○ |  | ○ |  |  |
| ブラックリスト | 更新 | ○ |  | ○ |  |  |
| 検知ルール | 閲覧 | ○ | ○ | ○ | ○ | ○ |
| 検知ルール | 更新 | ○ |  | ○ |  |  |
| メールテンプレート | 閲覧 | ○ | ○ | ○ | ○ | ○ |
| メールテンプレート | 更新 | ○ |  |  | ○ |  |
| メール送信ログ | 閲覧 | ○ | ○ | ○ | ○ | ○ |
| お知らせ | 閲覧 | ○ | ○ | ○ | ○ | ○ |
| お知らせ | 作成 | ○ |  | ○ |  |  |
| お知らせ | 更新 | ○ |  | ○ |  |  |
| お知らせ | 公開 / 終了 / 更新追加 | ○ |  | ○ |  |  |
| 課金プラン | 閲覧 | ○ | ○ | ○ | ○ | ○ |
| 課金プラン | 作成 | ○ |  | ○ |  |  |
| 課金プラン | 更新 | ○ |  | ○ |  |  |
| 定期課金 | 閲覧 | ○ | ○ | ○ | ○ | ○ |
| 定期課金 | 作成 | ○ |  | ○ |  |  |
| 定期課金 | 課金 / 一時停止 / 再開 / 解約 | ○ |  | ○ |  |  |
| デモの課金失敗率 | 閲覧 | ○ | ○ | ○ | ○ | ○ |
| デモの課金失敗率 | 更新 | ○ |  |  | ○ |  |
| 決済リンク | 閲覧 | ○ | ○ | ○ | ○ | ○ |
| 決済リンク | 作成 | ○ |  | ○ |  |  |
| 決済リンク | 無効化 | ○ |  | ○ |  |  |
| IP 制限 | 閲覧 | ○ | ○ | ○ | ○ | ○ |
| IP 制限 | 作成 | ○ |  |  | ○ |  |
| IP 制限 | 更新 | ○ |  |  | ○ |  |
| IP 制限 | 削除 | ○ |  |  | ○ |  |
| 決済プロバイダ | 閲覧 | ○ | ○ | ○ | ○ | ○ |
| 決済プロバイダ | 作成 | ○ |  |  | ○ |  |
| 決済プロバイダ | 更新 | ○ |  |  | ○ |  |
| 決済プロバイダ | 削除 | ○ |  |  | ○ |  |
| 決済プロバイダ | 接続テスト | ○ |  |  | ○ |  |
| 決済手段の停止 | 閲覧 | ○ | ○ | ○ | ○ | ○ |
| 決済手段の停止 | 全体停止 | ○ |  |  |  |  |
| 決済手段の停止 | 加盟店別停止 | ○ |  | ○ |  |  |
| 管理者アカウント | 閲覧 | ○ |  |  |  |  |
| 管理者アカウント | 作成 | ○ |  |  |  |  |
| 管理者アカウント | 更新 | ○ |  |  |  |  |
| 管理者アカウント | 仮パスワード / 2FA 解除 | ○ |  |  |  |  |
| 自分のアカウント | 更新 | ○ | ○ | ○ | ○ | ○ |
| 操作ログ | 閲覧 | ○ | ○ | ○ | ○ | ○ |
| 横断検索（管理者） | 閲覧 | ○ |  |  |  |  |
| 全体設定 | 閲覧 | ○ |  |  |  |  |
| 全体設定 | 更新 | ○ |  |  |  |  |
| 顧客 | 閲覧 | ○ | ○ | ○ | ○ | ○ |
| 顧客 | 匿名化 | ○ |  |  |  |  |
| CSV 出力 | 出力 | ○ | ○ | ○ | ○ |  |
| 個人情報 | マスク解除 | ○ |  | ○ |  |  |
| API ドキュメント | 閲覧 | ○ | ○ | ○ | ○ | ○ |
<!-- permissions:end -->

## 加盟店設定の拡張（フェーズB）

- **加盟店詳細はタブ**（`lib/merchants/detail.ts` の `MERCHANT_TABS`: basic / contract / limits / apikeys / notify、`?tab=` で切替）。basic / notify は従来の `MerchantForm`（編集モード）、他は `components/merchant-tabs/*` の専用フォーム。データは `loadMerchantContract` / `loadMerchantLimits(id, mode)` / `loadMerchantApiKeys` で page.tsx が取得
- **契約・手数料**: `MerchantFeeSchedule`（`plan` standard | premium | custom、`rates` は `lib/merchants/fees.ts` の `FeeRates` を JSON 文字列で保存、`effectiveFrom`）。適用中は `currentScheduleIndex`（`effectiveFrom <= now` の最新）、履歴は削除しない。`POST /api/merchants/[id]/fees` で追加（監査 `merchant.fee_update`）。手数料計算は `calculateFee`（フェーズDの精算で使う）
- **限度額**: `MerchantLimit`（`@@unique([merchantId, method])`、`perTransaction` / `daily` / `monthly` は null = 無制限）。`PUT /api/merchants/[id]/limits` は全置換（監査 `merchant.limit_update`）。判定は `lib/merchants/limits.ts` の `checkLimit`（`COUNTED_STATUSES` の当日 / 当月合計、モード別）で **`POST /api/payments` の作成時に実行**。超過は取引を `failed` + `Payment.failureReason = "limit_exceeded:<per_transaction|daily|monthly>"` で記録（イベント created → fail、actor system）。UI は `paymentDetail.failure_limit_*` / `transactions.limitExceeded`
- **期限**: `Merchant.transferDueDays`（既定 7、1〜60）が `transferDueDate(now, days)` に渡り、`Merchant.refundWindowDays`（既定 180、0〜365）から `loadTransactionDetail` が `refundDeadlineAt` を導出（表示のみ。返金の強制はフェーズC）。`PATCH /api/merchants/[id]/terms`（監査 `merchant.terms_update`）。期限超過の振込待ちは `GET/POST /api/cron/expire-transfers`（`CRON_SECRET`、`vercel.json` で毎時）が `applyPaymentAction(expire, actor "system", audit cron)` で期限切れにする
- **APIキー**: `ApiKey`（`mode` test | live、`kind` api_key | signing_secret、`keyPrefix` 表示用、`keyHash` SHA-256 @unique、`expiresAt` / `revokedAt` / `lastUsedAt`）。平文は `generateApiKey`（`wp_<mode>_<ak|ss>_<32 文字>`）で発行時に 1 回だけ返し **保存しない**。`POST .../api-keys`（`api_key.issue`）、`POST .../api-keys/[keyId]/rotate`（旧キーに `expiresAt` = 猶予 `ROTATION_GRACE_DAYS`、`api_key.rotate`）、`.../revoke`（`api_key.revoke`）。加盟店向け認証は `app/api/merchant-api/ping/route.ts`（Bearer → `hashApiKey` で検索 → `apiKeyUsable` → `merchant_api` の IP ルール → `lastUsedAt`）。`/api/merchant-api/*` は middleware の `SIGNATURE_AUTH_PREFIXES`（セッション不要）。seed の固定平文は `SEED_API_KEYS`
- **テスト / 本番モード**: `lib/mode.ts`（Cookie `wirepay.mode`、既定 test、`modeFromCookieStore(cookies())`）。ヘッダーの `ModeToggle`（`components/mode-provider.tsx`）が Cookie を書いて `router.refresh()`。決済一覧・申請一覧・ダッシュボード・限度額の利用状況は **常に `livemode` で絞る**（旧 `?mode=all` チップは廃止）。seed に本番モードの取引（payment8 / payment9）あり

## 返金管理（フェーズC）

- **返金 = `Refund` テーブルの申請行**。列: `amount`, `kind`（full | partial）, `reasonCode`（customer | defect | duplicate | other。other は `reason` 必須）, `status`（requested | approved | rejected | processing | completed | failed）, `forced`（返金可能期限超過をマスターが強制）, `requestedById` / `approvedById`（AdminUser）, `decisionNote`, `merchantId` / `livemode` スナップショット。語彙と Zod は `lib/refunds/types.ts`
- **フロー**: `POST /api/refunds`（`requireAdmin`。一般権限も可）が `lib/refunds/service.ts` の `createRefundRequest` で申請（残額 − 返金済 − 審査待ち額を検証、期限超過は master + `force` + 理由のみ）。`POST /api/refunds/[id]/approve`（`requireMaster`）は `applyPaymentAction(refund, { refund: { id, approvedById } })` で **同じ状態遷移** を通して取引を `partially_refunded` / `refunded` にし、行を completed にする（デモは即時完了）。`.../reject` は rejected。監査 `refund.request` / `refund.approve` / `refund.reject`（`payment.refund` も承認時に記録）
- 取引詳細の「返金申請」ダイアログ（`components/payment-actions.tsx`）は `/api/refunds` に POST する。旧 `POST /api/payments/[id]/refund` は Webhook / API 互換のため残し、`applyPaymentAction` が `refund` 指定なしのとき completed 行を直接作る
- 一覧 `/refunds`（`lib/refunds/list.ts`、既定順 = requested 先頭、CSV `?format=csv`）と詳細 `/refunds/[id]`。取消（void）は既存の `cancel` アクション（UI 表示「キャンセル」）で、返金とは別ボタン

## 精算管理（フェーズD）

- **精算設定は `Merchant` の列**（`settlementCycle` monthly | semimonthly | weekly、`payoutTerm` next_month_end | next_month_15 | month_after_next_15 | next_week、`bankName` / `bankBranch` / `bankAccountType`（ordinary | current）/ `bankAccountNumber`（7〜8 桁）/ `bankAccountHolder`、`settlementFee`）。語彙と Zod は `lib/settlements/types.ts`、`PATCH /api/merchants/[id]/settlement`（監査 `merchant.settlement_update`）、加盟店詳細の `settlement` タブ（`components/merchant-tabs/settlement-tab.tsx`）
- **`SettlementBatch`**（`@@unique([merchantId, livemode, periodFrom, periodTo])`、`periodTo` は排他的終端、`status` collecting | confirmed | scheduled | paid | held、`holdReason`、`scheduledAt` は `payoutDate(periodEnd, payoutTerm)`）と **`SettlementLine`**（`kind` payment | refund | chargeback、`amount` は返金・チャージバックが負、`fee` は完了時点の契約料率で `calculateFee`）。生成は `lib/settlements/service.ts` の `generateBatch`（`collectLines`: 期間内に `capturedAt` の完了取引 + `completedAt` の完了返金 + `resolvedAt` の lost/confirmed チャージバック）。`POST /api/settlements/generate`（`requireAdmin`、モードは `?mode=` か Cookie）
- 遷移は `SETTLEMENT_TRANSITIONS`（confirm / schedule / pay / hold（理由必須）/ release）を `transitionBatch` が status 条件付き `updateMany` で適用、`POST /api/settlements/[id]/[action]` は `requireMaster`。collecting のバッチのみ `DELETE`（破棄）可。監査 `settlement.*`
- 一覧 `/settlements`（生成フォーム + DataTable + CSV）、詳細 `/settlements/[id]`（内訳・明細・`/api/settlements/[id]/lines?format=csv`）。加盟店側は `GET /api/merchant-api/settlements[?id=]`（Bearer、`lib/merchants/api-auth.ts` の `authenticateMerchantApiKey` を ping と共用）。期間の既定値は `lib/settlements/schedule.ts` の `lastClosedPeriod`
- `Chargeback` テーブルはこのフェーズで追加済み（精算の控除用）。運用画面はフェーズF

## Webhook 送信（フェーズE）

- **`WebhookDelivery`**（`event` は `lib/webhooks/events.ts` の `MERCHANT_WEBHOOK_EVENTS`、`url` / `method` / `requestHeaders`(JSON) / `requestBody`、`status` pending | success | failed | retrying | abandoned、`attempts`、`nextRetryAt`、`responseStatus` / `responseBody`(先頭 1KB)）と **`WebhookAttempt`**（試行ごとの応答・所要時間・`trigger` system | cron | dashboard）。実装は `lib/webhooks/deliver.ts`
- **ペイロード**は `lib/merchants/notification.ts` の `buildNotificationRequest(cfg, values)`（加盟店の通知形式 × パラメータセット × 識別子。`event` パラメータを常に含む）。プレビューの `buildNotificationSample` も同じ関数を使う。相対 `notifyUrl`（seed の `/api/demo/webhook-receiver`）は `appBaseUrl()`（`APP_URL` → `VERCEL_PROJECT_PRODUCTION_URL` → localhost）で解決
- **署名**: `X-Signature: v1=<HMAC-SHA256(secret, "<X-Timestamp>.<payload>")>` + `X-Timestamp`（互換で `Wirepay-Signature: t=..,v1=..` も送る）。鍵は加盟店の最新の有効な署名シークレット（同じモード。`ApiKey.secretEnc` に AES-GCM で保持、発行 / ローテーション時に `encryptSigningSecret`）、無ければ加盟店パスワード。`lib/merchants/secrets.ts` が `lib/crypto` を import してよい 2 つ目のモジュール（署名シークレットもここ）
- **送信**: `emitPaymentWebhook(prisma, paymentId, event)` を `applyPaymentAction` の commit 後（`webhookEventFor(action, status)`: capture / 一致入金 → payment.completed、fail、expire、cancel、refund → refund.completed）と `POST /api/payments` の限度額超過（`limit.exceeded`）から呼ぶ。失敗しても呼び出し元は失敗しない。`fetch` は 10 秒 `AbortController`。テスト（`NODE_ENV=test`）や `WEBHOOK_DELIVERY=queue` では **キューに積むだけ**（`deliveryDeferred()`）で、テストは `attemptDelivery` を `fetch` スタブで呼ぶ
- **リトライ**: `RETRY_DELAYS_MS` = 1分 / 5分 / 30分 / 2時間 / 24時間、`MAX_ATTEMPTS` 5 → abandoned。`GET/POST /api/cron/webhook-retry`（`CRON_SECRET`、`vercel.json` 毎時 30 分）が `processDueRetries`。手動再送は `POST /api/webhook-logs/[id]/resend`（`requireMaster`、監査 `webhook.resend`、trigger dashboard）
- 画面: `/webhook-logs`（失敗 / 断念 / リトライ待ちを先頭に、CSV）、`/webhook-logs/[id]`、加盟店詳細の `webhooks` タブ。デモ受信 `/api/demo/webhook-receiver?result=ok|error|timeout`（middleware の `PUBLIC_PATHS`）。KPI「失敗件数」

## リスク対策（フェーズF）

- **チャージバック**: `Chargeback`（`reasonCode` fraud | not_received | not_as_described | duplicate | other、`status` received | disputed | won | lost | confirmed、`disputeDeadlineAt` 既定 14 日、`evidenceNote`、`resolvedAt`）。`lib/chargebacks/{types,service,list}.ts`。登録 `POST /api/chargebacks`（`requireMaster`、完了系の取引のみ、対応中の重複不可、Webhook `chargeback.opened`）、`POST /api/chargebacks/[id]/dispute|resolve|confirm`。敗訴・確定は `applyPaymentAction(chargeback)` で取引を **`chargeback` ステータス**（`PAYMENT_STATUSES` / `TRANSITIONS.chargeback`: captured | partially_refunded | refunded →、UI アクションではない）にし、精算の `collectLines` が `resolvedAt` 期間内の lost / confirmed を控除。画面 `/chargebacks`（対応中→期限順）、`/chargebacks/new`（`requireMasterPage`、取引詳細からのリンク付き）、`/chargebacks/[id]`
- **ブラックリスト / 連続失敗検知**: `Payment.cardHash`（`cardFingerprint` = sha256(brand|last4|expiry)。`POST /api/payments` の `card` 入力）/ `cardLast4`（横断検索の対象）/ `clientIp`（`clientIpFromHeaders`）。`RiskSetting`（id `global`: `windowMinutes` / `maxFailures`、`GET/PUT /api/risk-settings` マスター）、`Blacklist`（`kind` card | ip | email、`source` auto | manual、`status` candidate | active | disabled | rejected、`@@unique([kind, value])`）。`lib/risk/service.ts`: `checkBlacklist`（作成時、active 一致 → `failed` + `failureReason "blocked:<kind>"`、限度額判定より先）、`detectRepeatedFailures`（作成時の失敗と `applyPaymentAction(fail)` の後に呼ぶ。window 内の失敗数 ≥ 閾値で candidate を upsert、監査 actor system）。`/api/blacklist`（GET、POST マスター）、`PATCH /api/blacklist/[id]`（approve = active / reject / disable / enable）。画面 `/blacklist`（候補を先頭、手動追加・検知ルールのフォーム）
- **過不足入金**: `Payment.depositDiffStatus`（open | refund_arranged | notified | resolved。`applyPaymentAction(deposit)` が過不足発生時に `open` をセット）。`lib/risk/deposit-diffs.ts`（一覧ローダと `applyDepositDiffAction`: excess → `createRefundRequest`（理由 duplicate）で refund_arranged、short → `lib/email/hooks.ts` の `notifyDepositShort`（フェーズG でメール送信ログ）で notified、resolve）。`/api/deposit-diffs`、`POST /api/deposit-diffs/[id]/refund|notify|resolve`（`requireAdmin`、監査 `payment.deposit_diff_update`）。画面 `/deposit-diffs`。seed の過不足サンプルは **本番モード**（payment10 / payment11）
- KPI: チャージバック対応中件数、ブラックリスト候補件数、過不足未対応件数

## レポート・メール・お知らせ（フェーズG）

- **集計レポート**: `lib/reports/service.ts` の `buildReport(filters)`（`granularity` daily | monthly | custom、期間は `createdAt`、モード・加盟店・決済種別で絞り込み。完了 = captured | partially_refunded | refunded | chargeback、離脱 = expired | cancelled。系列・決済種別シェア・加盟店ランキング上位 10 をメモリ集計、上限 5,000 行）。`GET /api/reports`（`?format=csv&kind=summary|detail`）。画面 `/reports`、グラフは `components/charts.tsx` の自前 SVG（外部ライブラリ禁止）
- **メール**: `EmailTemplate`（`@@unique([key, lang])`、キーは `lib/email/templates.ts` の `EMAIL_TEMPLATE_KEYS`、プレースホルダーは `EMAIL_PLACEHOLDERS` / `renderTemplate`、既定文面 `DEFAULT_EMAIL_TEMPLATES` を seed が upsert）と `EmailLog`（`status` sent | failed | demo、`provider`）。送信は **`lib/email/send.ts` の `sendTemplatedEmail` のみ**（プロバイダは `EMAIL_PROVIDER` = log（既定・記録のみ）| console。実サービスは `EmailProvider` を追加）。イベントフックは `lib/email/hooks.ts`（`notifyTransferIssued`: 銀行振込作成、`notifyPaymentCompleted`: capture / 一致入金、`notifyRefundCompleted`: 返金承認、`notifyDepositShort`: 過不足の案内、`notifyAdminInvite`: 管理者招待。すべて例外を握りつぶす）。ユーザー向けは `CUSTOMER_EMAIL_LANG`（既定 ja、`EMAIL_DEFAULT_LANG`）。画面 `/email-templates`（編集はマスター、監査 `email_template.update`）、`/email-logs`
- **お知らせ**: `Announcement`（`kind` notice | maintenance | incident、`status` draft | published | ended、`publishFrom` / `publishUntil`、`targetAll` + `targetMerchantIds` JSON）と `AnnouncementUpdate`（`phase` occurred | investigating | resolved）。`lib/announcements/{types,service,list}.ts`（`loadActiveAnnouncements(merchantId?)` が公開中の絞り込み）。`/api/announcements`（GET / POST `publish: true` で即公開）、`/api/announcements/[id]`（GET / PATCH）、`/api/announcements/[id]/publish|end|update`、加盟店向け `GET /api/merchant-api/announcements`。**バナー**は `app/layout.tsx` が公開中の maintenance / incident を `AppShell` の `banner` prop に渡し `components/announcement-banner.tsx` が描画（notice は出さない）。監査 `announcement.*`

## 定期課金・決済リンク・代理店手数料（フェーズH）

- **取引の作成は `lib/payments/create.ts` の `createTransaction(prisma, body, { clientIp, audit, source, paymentLinkId?, subscriptionId? })` が唯一の実装**（`POST /api/payments` は薄いラッパー）。冪等キー・ブラックリスト・限度額・振込ID採番・監査 `payment.create`・Webhook（限度額超過 / 自動完了時の `payment.completed`）・振込案内メール・連続失敗検知までここで行う。`source` は `dashboard | payment_link | subscription`。`Payment.paymentLinkId` / `subscriptionId`（SetNull）で由来を保持
- **定期課金**: `Plan`（`merchantId`, `name`, `amount`, `interval` monthly | yearly | weekly, `trialDays`, `active`）と `Subscription`（`planId` Restrict, `customerId` / `customerName` / `customerEmail`, `status` trialing | active | past_due | suspended | cancelled, `livemode`, `nextChargeAt`, `lastChargeAt`, `failCount`）。語彙と Zod は `lib/subscriptions/types.ts`（`RETRY_DAYS` = [3, 7], `MAX_CHARGE_FAILURES` = 3, `addInterval`）、実装は `lib/subscriptions/service.ts`: `createSubscription`（無料期間あり → trialing、なし → active で即課金対象）、`chargeSubscription(db, { subscriptionId, forceOutcome?, now? })`（同モードの有効なクレジットプロバイダで `createTransaction(source: "subscription")`。成功 → captured・`nextChargeAt += interval`・Webhook `subscription.charged`。失敗 → `failCount++`、past_due で 3 日 / 7 日後に再試行、3 回で suspended、Webhook `subscription.payment_failed` / `subscription.suspended`、メール `subscription_failed` / `subscription_suspended`）、`processDueSubscriptions`（`GET/POST /api/cron/subscriptions`、`CRON_SECRET`、`vercel.json` 毎時 15 分）、`applySubscriptionAction`（pause → suspended / resume → active で即課金対象 / cancel）。デモの失敗率は `RiskSetting.demoChargeFailPercent`（`GET/PUT /api/subscriptions/demo-settings` マスター、`forceOutcome` 指定時は無視）。API: `/api/plans`（GET / POST）、`/api/plans/[id]`（GET / PATCH）、`/api/subscriptions`（GET + CSV / POST、モードは `?mode=` か Cookie）、`/api/subscriptions/[id]`、`POST /api/subscriptions/[id]/charge|pause|resume|cancel`（**`requireMaster`**、charge は `{ outcome: "success" | "failure" }` で結果を指定可）。画面 `/subscriptions`（一覧 + プラン + デモ失敗率）、`/subscriptions/new`、`/subscriptions/plans/new|[id]`、`/subscriptions/[id]`。監査 `plan.*` / `subscription.*`
- **決済リンク**: `PaymentLink`（`token` @unique 24 文字、`productName`, `amount`, `description`, `expiresAt`（指定日の翌日 0 時 JST）, `maxUses`（null = 無制限）, `usedCount`, `status` active | disabled, `livemode`, `createdById`）。`lib/payment-links/{types,service,list}.ts`: `createPaymentLink` / `disablePaymentLink`（監査 `payment_link.create` / `payment_link.disable`）、`linkUnavailableReason`（disabled | expired | exhausted）、`checkoutMethods`（加盟店の `enabledMethods` ∩ 同モードの有効プロバイダ）、`checkoutFromLink`（`createTransaction(source: "payment_link", autoCapture: false)` → 注文番号 `LNK-<TOKEN6>-<連番>`、`usedCount++`）。**公開決済ページ `/pay/[token]`** は `AppShell` が管理ナビを外して描画、API `GET/POST /api/pay/[token]`（`ipRestricted: false`、middleware の `PUBLIC_PREFIXES` でセッション不要）と `POST /api/pay/[token]/complete`（デモの「支払いを確定」= そのリンクの取引を actor system で capture）。銀行振込は振込ID・期限を表示して awaiting_transfer。管理画面 `/payment-links`、`/payment-links/new`、`/payment-links/[id]`（QR は `uqr` の `renderSVG`、無効化）。seed の固定トークンは `SEED_PAYMENT_LINK_TOKEN`
- **代理店手数料**: テーブルは持たず `lib/agent-fees/service.ts` の `buildAgentFees({ month, agent, mode })` が精算バッチ（担当代理店あり・confirmed | scheduled | paid・`periodFrom` が対象月）から `agentFee(netAmount, feeRate)`（円未満切り捨て）を集計。`GET /api/agent-fees?month=YYYY-MM&agent=&mode=`（`?format=csv` で明細）。画面 `/agent-fees`、代理店詳細に当月サマリー、KPI「今月の手数料」
- 一覧 `/subscriptions` / `/payment-links` は `livemode` で絞る（ヘッダーのモード）。新しい Webhook イベント `subscription.charged` / `subscription.payment_failed` / `subscription.suspended`、メールテンプレート `subscription_failed` / `subscription_suspended`（`EMAIL_TEMPLATE_KEYS` 8 種 × 2 言語 = 16 行）

## ロール・取引メモ・決済手段停止（フェーズI）

- **ロールは 5 種**（`lib/role.ts` の `ROLES`）。旧 `master` → `admin`、`general` → `cs` は seed が `updateMany` で冪等に移行し、Cookie の旧ロール名は `normalizeRole` が読み替える（再ログインで新名に更新）。デモアカウントは `prisma/seed-accounts.ts` に 1 ロール 1 つ（`kuromaru` admin / `general` cs / `accounting` / `developer` / `viewer`）。テストは `sessionHeaders("admin" | "accounting" | "cs" | "developer" | "viewer")`（旧名も可）
- **権限判定**: `PERMISSIONS[resource][action]` が唯一の定義。API は `requirePermission(req, resource, action)`（401 / 403 `permission_required`）、`requireMaster` は `admin_user.update` の別名として管理者管理だけに残す。ページは `requirePermissionPage`。client は `useCan(resource, action)` / `useRole().can`。ナビ項目は `permission: [resource, action]` で出し分け。CSV は `withApiHandler` が `?format=csv` を検出し `lib/settings/csv-guard.ts` で `csv.export`（viewer は `GlobalSetting.viewerCsvExport` が true のときのみ）を判定。管理者詳細は `describeRole` で「可能な操作」を表示。表の生成は `npx tsx scripts/gen-permissions.ts`（CLAUDE.md と intro.md の `permissions:start/end` マーカー間を置換）
- **取引メモ**: `TransactionNote`（`paymentId`, `authorId`, `body`, `pinned`, `editedAt`）。`lib/payments/notes.ts`、API `GET/POST /api/payments/[id]/notes`、`PATCH/DELETE .../notes/[noteId]`（本文編集は投稿者のみ 403 `not_author`、ピン留めは `payment_note.pin`、削除は admin のみで監査 `payment.note_delete`。作成・編集は監査しない）。`components/payment-timeline.tsx` が `PaymentEvent` とメモを時系列にマージ、一覧の行はピン留め数（`TRANSACTION_SELECT.notes`）でアイコン表示。加盟店側画面（フェーズL）には出さない
- **決済手段停止**: `PaymentMethodControl`（`scope` global | merchant、`merchantId?`、`method` credit | qr | convenience | bank、`suspended`、`reason`、`resumeAt`、`resumedAt`、`@@unique([scope, merchantId, method])`）。`lib/payments/method-controls.ts`: `assertMethodAvailable`（**`createTransaction` が呼ぶ** → 409 `method_suspended`。管理画面・決済リンク・定期課金・将来の公開 API / サンドボックスすべてがここを通る）、`suspendedMethods`（決済リンクの `checkoutMethods` と作成フォームの選択肢から除外）、`setMethodControl`（理由必須、監査 `payment_method.suspend / resume`、`emitNotification`: 全体停止は critical）、`resumeDueControls`（`GET/POST /api/cron/payment-method-controls`、毎時 45 分）。API `GET/PUT /api/payment-method-controls`（global = `suspend_global` admin、merchant = `suspend_merchant` admin / cs）。画面 `/payment-method-controls`（4 トグル、停止後に障害お知らせ下書きの作成を確認 → `/announcements/[id]` へ）、加盟店詳細の `methods` タブ、全体停止中は `app/layout.tsx` → `AppShell suspendedMethods` → `components/method-banner.tsx` の赤バナー
- **通知（J の最小部分）**: `Notification` / `NotificationRead` テーブルと `lib/notifications/emit.ts` の `emitNotification`（同一 kind + 対象は 24 時間に 1 通）。画面・既読・メール / Slack は J
- **GlobalSetting**（id `global`）: `lib/settings/global.ts`、`GET/PUT /api/global-settings`（admin、監査 `global_setting.update`）、画面 `/global-settings`。以降のフェーズは列を足す

## 通知センター（フェーズJ）

- **発生源**: `lib/notifications/emit.ts` の `emitNotification(db, { kind, severity?, title, body, href, roles, targetType, targetId })`。種別と既定の重要度は `lib/notifications/types.ts` の `NOTIFICATION_KINDS` / `NOTIFICATION_DEFAULT_SEVERITY`（14 種）。同一 kind + 対象は 24 時間に 1 通。組み込み先: `attemptDelivery`（webhook.abandoned）、`setMethodControl` / `resumeDueControls`、`lib/cron/run.ts` の `runCron`（batch.failed。全 cron route を包む）、`lib/notifications/digest.ts` の `runDailyDigests`（transfer.overdue / cvs.overdue = 日次 1 通、chargeback.deadline = 期限 3 日以内）、`detectRepeatedFailures`（blacklist.candidate）、`createTransaction`（limit.exceeded）、`recordFailure`（subscription.payment_failed）、`generateBatch` / `transitionBatch(hold)`、`createRefundRequest`（対象ロール admin / accounting）、`POST /api/merchants`
- **配信**: `lib/notifications/deliver.ts` の `dispatchPendingNotifications`（`dispatchedAt` null の行を claim して配信）。root の PrismaClient から emit したときは即時、tx 内から emit したときは毎時 50 分の `GET/POST /api/cron/notifications`（日次まとめも同じ cron）で配信。メールは `NotificationPreference.email` の管理者へテンプレート `notification`（プレースホルダー `title` / `body` / `link`）で送信ログへ、Slack は `GlobalSetting.slackWebhookUrl` に `sendSlack`（8 秒タイムアウト、1 回リトライ、`SlackLog`。テスト / `WEBHOOK_DELIVERY=queue` では `demo` 記録のみ、`force` でテスト送信）
- **閲覧**: `lib/notifications/list.ts`。可視性は `roles` JSON が空か自ロールを含む行。`GET /api/notifications`（絞り込み kind / severity / read / from / to）、`GET /api/notifications/unread`（ベル: 未読数 + 最新 10 件、未ログインは空）、`POST /api/notifications/[id]/read`、`POST /api/notifications/read-all`、`GET/PUT /api/notifications/preferences`（自分の設定のみ）、`POST /api/global-settings/slack-test`（admin）。画面 `/notifications`、`/notifications/settings`、ヘッダー `components/notification-bell.tsx`（60 秒ポーリング）、全体設定に Slack URL とテスト送信。ナビ `notifications`（配信グループ）、KPI「未読」

## コンビニ決済・領収書 PDF・インボイス（フェーズK）

- **コンビニ決済は `Payment` の列**（`cvsBrand` seven | lawson | familymart | ministop | other、`cvsReceiptNo` 13 桁 @unique、`cvsPaidAt`。期限は `transferDueAt` を共用、`Merchant.cvsDueDays` 既定 3 / 1〜30）。語彙は `lib/payments/konbini.ts`（`generateCvsReceiptNo` / `cvsDueDate` / `formatCvsReceiptNo`）。`createTransaction` が `method === "convenience"` のとき採番し、メール `cvs_guide` を送る。ステータスは新設せず **`pending` = 支払待ち**（申請一覧で振込待ちと同じレーン、`transactions.cvsWaiting` バッジ）。`TRANSITIONS.deposit.from` に `pending` を追加し、`applyPaymentAction(deposit)` は `cvsReceiptNo` があれば `reconcileDeposit(..., "pending")` で判定して `cvsPaidAt` を刻む（振込IDも受付番号も無い取引は 400）。actor `cvs` / 監査 actorType `cvs`。`POST /api/demo/cvs-notify`（`DEPOSIT_NOTIFY_SECRET` 共用、`{ receiptNo, amount? }`）と決済リンクページの「店頭で支払い済みにする（デモ）」が同じ deposit を呼ぶ。期限切れは `expireOverdueTransfers` が `pending + cvsReceiptNo` も対象にし、日次ダイジェスト `cvs.overdue` はそのまま。ダッシュボードの期限超過件数も含む
- **領収書 = `Receipt`**（`paymentId` @unique、`receiptNo` `RC-YYYYMM-00001` 月次連番、`recipientName`、`amount` = 金額 − 返金済、`source` dashboard | customer、`issuedById`、`reissueCount`、`lastIssuedAt`）。`lib/receipts/service.ts` の `issueReceipt`（完了 / 一部返金のみ、再発行は番号据え置きで回数++、毎回 `receipt.issue` を監査。customer の再ダウンロードは再発行に数えない）。`POST /api/payments/[id]/receipt`（`receipt.issue`: admin / accounting / cs）、`GET .../receipt`（PDF、`requireAdmin`）。**エンドユーザー DL は署名付き URL**（`lib/receipts/customer-token.ts`、HMAC(SESSION_SECRET) over リンクトークン + 取引ID + 期限 30 日、`GET /api/pay/[token]/receipt?p=&e=&s=`）で、管理者セッションと無関係。`POST /api/pay/[token]/complete` が `receiptUrl` を返す
- **PDF は `lib/pdf/document.ts`**（pdf-lib + @pdf-lib/fontkit、`lib/pdf/fonts/` の Noto Sans JP サブセット Regular = JIS X 0208 約 2.1 MB / Bold = 第 1 水準 約 1 MB。`scripts/build-pdf-font.mjs` + `scripts/pdf-font-unicodes*.txt` で再生成、ライセンスは `fonts/LICENSE.txt`）。**pdf-lib 自身のサブセット化（`subset: true`）はこの TTF でグリフが欠けるので使わない**: 描画を ops として記録し、`bytes()` で使用文字だけを `subset-font`（HarfBuzz wasm、約 40 ms）で切り出して `subset: false` で埋め込む（領収書 1 枚 10〜30 KB）。文字幅は fontkit で計測。`next.config.js` の `outputFileTracingIncludes` で `/api/**` にフォントと `harfbuzzjs/hb-subset.wasm` を同梱。Chromium 系は 50 MB 圧縮上限を超えるため不採用。`lib/pdf/receipt.ts` / `invoice.ts` はチェック対象外（`scripts/check-i18n.mjs` の ALLOW）
- **インボイス**: `GlobalSetting` に `issuerName` / `issuerRegistrationNo`（`REGISTRATION_NO_RE` = T + 13 桁）/ `issuerAddress` / `issuerTel` / `taxRounding`（floor 既定 | round | ceil）、`Merchant` に `invoiceNumber` / `address`（精算設定タブ・`PATCH /api/merchants/[id]/settlement`）、`SettlementLine.taxCategory`（`TAX_CATEGORIES` standard10 | reduced8 | exempt。`collectLines` が売上行 standard10 / 返金・CB 行 exempt を付与、旧行は `defaultTaxCategory(kind)`）。税計算は `lib/settlements/tax.ts`（**手数料は内税**: `includedTax` = 税込 × 率 / (100 + 率) を税率ごとに丸める。差引支払額は変えない）。`GET /api/settlements/[id]/invoice`（`invoice.export`: admin / accounting、collecting は 409 `settlement_not_confirmed`、監査 `settlement.invoice_export`、番号 `INV-YYYYMM-<加盟店番号>`）
- 権限 `receipt.issue` / `invoice.export`、監査 `receipt.issue` / `settlement.invoice_export`、対象種別 `receipt`。マニュアル章 `konbini` / `receipts`。seed: コンビニプロバイダ `prov_cvs_demo`（web_conveni）、payment14（支払待ち）/ payment15（支払済 + 領収書 `rcp_demo_001`）、`SEED_CVS_RECEIPT_NOS`

## 公開 API v1・加盟店管理画面・API ドキュメント（フェーズL）

- **公開 API は `app/api/v1/*`**（transactions POST / GET / GET :id、refunds POST、payment-links POST、openapi.json GET）。認証は `lib/public-api/auth.ts` の `authenticatePublicApi`（既存の `authenticateMerchantApiKey` = Bearer `wp_<mode>_ak_` + 加盟店の `merchant_api` IP ルール、署名シークレットは 401）+ **レート制限** `lib/public-api/rate-limit.ts`（`ApiRateLimit` テーブルに加盟店 × モード × 分で計数、60/分、超過は 429 + `Retry-After` / `X-RateLimit-*`。`ApiError` に `headers` 引数を追加）。middleware の `SIGNATURE_AUTH_PREFIXES` に `/api/v1/`、route は `ipRestricted: false`
- 取引作成は `lib/public-api/transactions.ts` の `createApiTransaction` → **`createTransaction(source: "api")`**（プロバイダは method × キーの環境で選択、`enabledMethods` 外は 400 `method_not_enabled`、停止・限度額・ブラックリストは既存どおり）。PaymentEvent actor `api`、監査は `merchantAuditContext(merchantId)`（`AuditLog.actorType = "merchant"`、**`AuditLog.merchantId` 列**（`actorId` は AdminUser の FK なので使わない）。一覧・詳細は加盟店コードを表示）。テストカードは `lib/public-api/test-cards.ts`（`4242…` 成功 / `…3220` 与信止まり / `…0002` 拒否 など。`createTransaction` の `forcedFailure` で `failed` + `failureReason` を記録、本番キーでは 400 `test_card_in_live`、Luhn 不正は 400）
- レスポンス形状は `lib/public-api/serialize.ts`（`serializeTransaction` / `serializeRefund` / `serializePaymentLink`、`object` フィールド付き）。リクエスト Zod は `lib/public-api/schemas.ts`、**OpenAPI 3 は `lib/public-api/openapi.ts` の `buildOpenApiSpec`（`zodToJsonSchema` で Zod から生成、`PUBLIC_API_ENDPOINTS` が唯一のエンドポイント定義で `routeFile` を持ち、テスト `public-api.test.ts` が route の存在と Zod との一致を検査）**。返金は `createRefundRequest(actor: { id: null, role: "cs" })`（`RefundActor.id` は null 可、`requestedById` null）、決済リンクは `createPaymentLink(actorId: null)`
- **加盟店管理画面 `/merchant/*`**: セッションは `lib/merchant-portal/token.ts` の Cookie `wirepay.merchant`（HMAC、鍵派生を管理者と分離、purpose `merchant`、12 時間。Edge 対応）と `lib/merchant-portal/session.ts`（`loginMerchant`: 加盟店コード + `decryptMerchantPassword` を timing-safe 比較、**5 回失敗で 15 分ロック** `Merchant.failedLoginCount / lockedUntil`、423 `merchant_locked`、監査 `merchant.login / logout / lockout`、`requireMerchant(req)` / `page-guard.ts` の `requireMerchantPage()` → `/merchant/login`）。middleware は `/api/merchant-portal/*` の非 GET を加盟店 Cookie で検証（CSRF は共通、ログインはログイン用レート制限）。`app/merchant/layout.tsx` が `MerchantShell`（`lib/merchant-portal/nav.ts` の `MERCHANT_NAV`）を描画し、`AppShell` は `/merchant` `/docs` で管理チュームを外す
- 加盟店側 API `app/api/merchant-portal/*`: login / logout / refunds（`createRefundRequest`、加盟店の取引のみ）/ webhooks/[id]/resend（`resendDelivery`）/ api-keys/[keyId]/rotate（**test のみ**、live は 403 `live_key_rotation`）/ settlements/[id]/invoice（自加盟店 + 確定以降）。画面は `components/views/merchant/*`（内部メモは渡さない）。ヘッダーのモード切替は管理画面と同じ `wirepay.mode`
- **API ドキュメント `/docs/api/[chapter]`**（公開、`lib/api-docs/chapters.ts` の 6 章 = `content/api-docs/{ja,en}/*.md` を `lib/manual/markdown.tsx` で描画 + OpenAPI から生成したリファレンス / エラーコード表 / テストカード表）。サンドボックスは `/merchant/sandbox`（ブラウザから実 `/api/v1` を呼ぶ、キーは sessionStorage、`wp_live_` は拒否）。ナビ `apiDocs`（権限 `api_docs.view` = 全員）、マニュアル章 `public-api` / `merchant-portal`。`check:i18n` の ALLOW に `lib/public-api/openapi.ts` / `test-cards.ts`（{ja,en} データ）

## 顧客・PaymentToken・個人情報保護（フェーズM）

- **`Customer`**（`merchantId` + `externalId`（取引の `customerId`）で `@@unique`、`name` / `email` / `phone`、`anonymizedAt` / `anonymizeReason`）と **`PaymentToken`**（`customerId` + `cardHash` で `@@unique`、`brand` / `last4` / `expiry` / `label` / `lastUsedAt`。カード番号は保存しない）、**`AnonymizeBatch`**（`kind` retention | manual、件数、`note`、`actorId`）。`Payment.customerRef`（SetNull）で顧客を参照。`lib/customers/service.ts` の **`upsertCustomerForPayment` を `createTransaction` が呼ぶ**（管理画面 / 決済リンク / 定期課金 / 公開 API すべて。匿名化済み顧客が再取引すると復活）。既存行のバックフィルは `linkExistingPayments`（冪等。seed の末尾と `npm run db:link-customers`）
- **マスク**は `lib/pii/mask.ts`（`maskName` 姓のみ / `maskEmail` 先頭 2 文字 + `***@ドメイン` / `maskPhone` 下 4 桁 / `maskIp` 第 4 オクテット、`maskCustomerFields(row, mode)`、`maskDeep`）。**page.tsx が client に渡す前にマスク**する（取引一覧 / 詳細、申請、定期課金、未消込入金、メール送信ログ、横断検索 `lib/search.ts`、顧客一覧 `lib/customers/list.ts` の `PiiMode`）。`redactForAudit` は `maskValueForKey` で **保存時点で** 個人情報キー（customerName / payerName / contactName / *email* / phone / ip 系）をマスクする（汎用 `name` は対象外）。加盟店管理画面 `/merchant/customers` は自社データを **full** で表示
- **マスク解除**: `POST /api/pii/unmask`（`targetType` payment | customer | subscription | unmatched_deposit | email_log、権限 `pii.unmask` = admin / cs、1 回ごとに監査 `pii.unmask`（after は項目名のみ））。client は `components/pii-value.tsx` の `PiiValue`（取引詳細・定期課金詳細・メール送信ログ詳細・顧客詳細）
- **CSV**: `GlobalSetting.csvPii`（masked | full）。`lib/pii/csv.ts` の `piiCsvMode(req)` が full かつ admin / accounting のときだけ実値（顧客・定期課金・未消込入金・メール送信ログの `?format=csv`）
- **匿名化**: 手動は `POST /api/customers/[id]/anonymize`（権限 `customer.anonymize` = admin、理由必須、409 `already_anonymized`、監査 `pii.anonymize`）。保持期間は `GlobalSetting.piiRetentionMonths`（既定 24、1〜120）/ `auditRetentionYears`（既定 7、1〜30）で、`runRetention`（`GET/POST /api/cron/anonymize`、`CRON_SECRET`、`vercel.json` で 19:00 UTC = 04:00 JST）が「最終取引が期限より前の顧客」と「顧客に紐づかない古い取引」の個人情報を消去（`scrubCustomer`: 氏名 / メール / 電話 / `clientIp` / `cardHash` / `cardLast4` を null、トークン削除。金額・ステータスは残す）し、期限超過の `AuditLog` を削除（`audit_log.prune`）。実行ごとに `AnonymizeBatch` + 監査 `pii.anonymize_batch` + 通知 `pii.anonymized`（admin）。対象 0 件ならバッチ行を作らない
- API: `GET /api/customers`（一覧 + CSV、絞り込み merchant / q / anonymized）、`GET /api/customers/[id]`。画面 `/customers`（DataTable、`?tab=batches` で匿名化バッチ）、`/customers/[id]`（保存カード・取引・匿名化ダイアログ）、加盟店側 `/merchant/customers[/id]`。ナビ `customers`（加盟店グループ）、KPI「顧客数」、横断検索の顧客グループ、マニュアル章 `customers`、全体設定の「個人情報の保持と出力」。seed: `u_10021` に電話 + visa トークン、匿名化済み `cus_demo_anon`（merchant2 `u_20099`）、バッチ `anb_demo_001`。権限 `customer.view`（全員）/ `customer.anonymize`（admin）

## 未消込入金と API 再通知（銀行振込のみ）

- **`UnmatchedDeposit`**（`amount`, `payerName`, `receivedAt`, `bankReference`, `givenTransferId`（顧客が書いた誤った / 不足の振込ID）, `note`, `source` bank | manual, `status` unmatched | matched | dismissed, `paymentId` SetNull, `matchedTransferId`, `matchedById`, `matchedAt`, `dismissReason`, `livemode`）。振込IDの付け忘れなどで消込できなかった入金の置き場。`POST /api/demo/deposit-notify` は `transferId` が無い / 不明なら **404 ではなく 202 で未消込入金を登録**（`payerName` / `bankReference` / `receivedAt` / `mode` を任意で受ける）
- `lib/deposits/{types,service,list}.ts`: `registerUnmatchedDeposit`（監査 `deposit.register`）、`findTransferCandidates`（同モードの振込待ち、残額一致を先頭）、`matchUnmatchedDeposit`（振込IDを付与 → **同じ `applyPaymentAction(deposit)`** で消込 → 完了なら `payment.completed` の Webhook が加盟店へ飛ぶ = API 完結。監査 `deposit.match`）、`dismissUnmatchedDeposit`（`deposit.dismiss`）、`renotifyPayment`（**銀行振込の完了系取引のみ**、`emitPaymentWebhook(payment.completed)` を再送し `Payment.renotifiedAt` / `renotifyCount` を更新、監査 `payment.renotify`。クレジット等は 409 `not_bank_transfer`）
- API: `GET/POST /api/unmatched-deposits`（一覧 + CSV / 登録 `requireAdmin`）、`GET /api/unmatched-deposits/[id]`（候補付き）、`POST .../match`（`requireMaster`）、`POST .../dismiss`（`requireAdmin`）、`POST /api/payments/[id]/renotify`（`requireMaster`。静的セグメントなので `[action]` より優先）。画面 `/unmatched-deposits`（登録フォーム・候補付きの消込ダイアログ・却下）、取引詳細の「API 再通知」ボタン（`components/payment-actions.tsx`、銀行振込のみ表示）。KPI「未消込入金」。ナビ `unmatchedDeposits`

## 代理店・決済申請・IP制限・マニュアル

- **Agent（代理店）**: `agentCode`（`AGT-00001`・自動採番・変更不可）, `name`, `nameKana`（全角カタカナ）, `companyName`, `contactName`, `email`, `feeRate`（% 小数2桁まで）, `status`（`active | disabled`）。語彙 `lib/agents/types.ts`、Zod `lib/agents/schema.ts`、採番 `lib/agents/ids.ts`、API `app/api/agents`。加盟店を持つ代理店も削除ではなく `disabled` にする
- **決済申請 = `Payment` テーブルの未完了取引**（新テーブルは作らない）。加盟店サイトで決済方法が選択された時点で生成される取引で、列は `merchantId?`（SetNull）, `method`（`credit | qr | convenience | bank | other`、作成時に provider.category をスナップショット）, `productName`, `customerId`（ユーザーID）, `capturedAt`（完了日時）, 銀行振込専用の `transferId`（@unique・7/8 桁）, `transferDueAt`, `depositAmount`（累計）, `depositDiff`（`short | excess`）。一覧の並びは `lib/payments/list.ts` の `compareApplications`（振込待ちを期限順に先頭、期限超過は `overdue` フラグで赤表示）。旧 `PaymentApplication` テーブルは削除済み（migration `drop_payment_application`）
- **IpRestriction（IP制限）**: `target`（`admin | merchant_api`）, `merchantId`（`merchant_api` のとき必須）, `cidr`（IPv4 単体または CIDR。保存時に `normalizeCidr` でホストビットを落とす）, `label`, `mode`（`deny`=ブロック | `allow`=許可。フォーム既定は `deny`）, `enabled`。純関数は `lib/ip.ts`（`parseCidr` / `ipInCidr` / `evaluateRules` / `clientIpFromHeaders`）。**遮断は実装済み**: 有効な `admin` の `deny` ルールに一致する接続元は `lib/ip-restrictions/enforce.ts` の `checkAdminAccess` により、ページは `app/layout.tsx` が `BlockedScreen` を返し、API は `withApiHandler` が 403 `ip_blocked` を返す（Edge middleware は Prisma を使えないためここで行う）。Webhook / `demo/reset` / `deposit-notify` は `withApiHandler(handler, { ipRestricted: false })` で除外。自分の IP に一致する有効な deny ルールは `assertNotSelfBlock` が 400 `ip_self_block` で拒否する。`allow` は判定表示のみ（許可リストの強制はロックアウトの危険があるため行わない）
- **管理画面マニュアル**: 本文は `content/manual/{ja,en}/<chapter>.md`（章の一覧と順序は `lib/manual/chapters.ts` の `MANUAL_CHAPTERS`）。両言語のファイルを必ず対で置く。描画は `lib/manual/markdown.tsx` の自前 Markdown（見出し / 段落 / リスト / コードブロック / パイプ表 / 太字 / インラインコード / リンクのみ。外部 Markdown ライブラリは入れない）。章タイトルは辞書の `manual.chapters.*`。機能を追加・変更したら該当章も更新する
- 一覧はすべて `components/pagination.tsx`（`DEFAULT_PAGE_SIZE`）で件数表示 + ページング。デモ上限は `lib/demo.ts` の `DEMO_LIMITS`
- 採番の共通処理は `lib/ids.ts`（`formatCode` / `parseCode` / `nextCode` / `isUniqueViolation`）。一意制約違反は 1 回だけ再試行

## i18n 運用ルール（重要）

UIは日本語/英語対応。ヘッダーの「EN / 日本語」トグルで切替。選択は cookie(`wirepay.lang`) + localStorage に保存し、SSR は cookie → `Accept-Language` の順で初期言語を決める（英語ユーザーに日本語が一瞬見えることはない）。実装は自前（外部i18nライブラリ禁止・不要）。

### 新しいUI文字列を追加するとき

1. **必ず両言語の辞書に追加する**: `lib/i18n/messages/ja.ts`（マスター）と `en.ts` の同じ位置にキーを追加する。`en.ts` は `MessageShape<typeof ja>` 型なので、片方だけ追加すると**型エラーでビルドが落ちる**（これが正常な検知動作）。`{param}` の集合が両言語で一致することはテストで検査
2. キーは画面/機能単位で構造化する（`dashboard.*`, `providerForm.*`, `errors.*` など）。パラメータは `{count}` 形式で埋め込み、`t("key", { count: n })` で補間
3. コンポーネント側では `useT()` フックで参照する。文字列をJSXに直接ハードコードしない（日本語・英語とも）。`aria-label` も `t()` を使う

### データ内在文言（registry など）

- プロバイダ名・カテゴリ・フィールドラベル・helpText・selectオプションは辞書ではなく `LocalizedText` 型（`{ ja: "...", en: "..." }`）でデータの隣に書く。型で両言語必須
- 表示は `pickText(text, lang)`。client では `useLang()` の lang を使う
- placeholder は APIキー例など言語共通の技術文字列のみ plain string 可

### サーバー側（APIルート）の文言

- エラーは `throw new ApiError(status, code, "errors.xxx", params)`。`withApiHandler` が `x-lang` ヘッダで言語を決めて文言化する
- 新しいAPIを足すときも生の日本語/英語文字列を返さない

### 日付・通貨・タイムゾーン

- 日付は client では `useFormatDateTime()`、server では `lib/i18n` の `formatDateTime(date, lang)`。ja: `2026/09/01 12:34` / en: `Sep 1, 2026, 12:34 PM`
- **タイムゾーンは Asia/Tokyo 固定**（`lib/time.ts` の `BUSINESS_TZ`）。「本日」の境界も `startOfDayInTz` で計算する。サーバーの TZ に依存させない
- 通貨は言語に関わらず **JPY (¥) 固定**。`formatYen()` を使う（ロケール切替しない）

### 翻訳漏れの検査

`npm run check:i18n`（`scripts/check-i18n.mjs`）。許容箇所: `lib/i18n/messages/ja.ts`、`lib/providers/registry.ts` の ja 側、`prisma/seed-data.ts` のデモデータ（日本のEC想定で意図的に日本語）、`language-toggle.tsx` の「日本語」表記、`app/manifest.ts` の両言語併記。`content/manual/ja/*.md` は日本語版マニュアル本文なので対象外（検査は `.ts/.tsx` のみ）。

## 決済用語の対訳（変更しないこと）

管理者=Admin user / マスター=Master / 一般=General / 操作ログ=Audit log / 二段階認証=Two-factor (TOTP) / 招待=Invite /
加盟店=Merchant / 決済代行=PSP / 返金=Refund / 入金=Deposit・Payout /
加盟店ID=Merchant ID / 売上確定=Capture / 与信=Authorization /
取消=Void（DB値は `cancelled`、アクション名は `cancel`。UI のステータス表示は「キャンセル / Cancelled」） / チャージバック=Chargeback / コンビニ決済=Konbini Payments /
代理店=Agent / 決済申請=Payment Application（取引 = Transaction） / 申請中=Applied（DB値 `pending`） / 振込待ち=Awaiting transfer / 与信済=Authorized / 完了=Completed（DB値 `captured`） / 期限切れ=Expired /
振込ID=Transfer ID / 振込期限=Transfer deadline / 入金消込=Deposit reconciliation / 不足=Short / 超過=Excess / 入金通知=Deposit notification /
IP制限=IP Restriction / ブロック=Block（DB値 `deny`） / 許可=Allow / 許可リスト=Allow list / 手数料率=Fee rate

## 進捗（PSP 実運用機能の追加）

次のセッションはここから再開する。各フェーズの仕様は依頼文（フェーズA〜H + 仕上げ）を正とする。

- [x] **フェーズA 基盤**（完了）: AdminUser ログイン + TOTP 二段階認証、`RoleToggle` 廃止、AuditLog + `recordAudit` を全更新系に適用、横断検索（Ctrl+K）、`lib/nav.ts` によるグループ化ナビとトップカード、共通 `DataTable`（管理者一覧・操作ログで使用）
- [x] **フェーズB 加盟店設定の拡張**（完了）: 加盟店詳細のタブ化、契約プラン / 手数料率の履歴、限度額（作成時判定 + 失敗理由）、振込期限（毎時 cron で期限切れ）・返金可能期限（表示）、API キー / 署名シークレット（発行・ローテーション・失効・`/api/merchant-api/ping`）、ヘッダーの test / live スイッチ
- [x] **フェーズC 返金・取消管理**（完了）: 返金申請（理由コード・全額/一部・残額と審査待ち額の検証・返金可能期限の強制はマスターのみ）→ マスターの承認/否認、返金管理一覧/詳細、取引詳細の返金申請ダイアログ、KPI（審査待ち件数）
- [x] **フェーズD 精算管理**（完了）: 精算設定タブ、SettlementBatch / Line の生成（契約料率で手数料計算・返金/チャージバック控除）、確定 → 振込予定 → 振込済 / 保留（マスター）、一覧・詳細・明細 CSV、加盟店 API での精算参照、KPI
- [x] **フェーズE Webhook 送信ログと再送**（完了）: 実送信（通知設定に従うペイロード、X-Signature / X-Timestamp、10 秒タイムアウト）、指数バックオフの自動再送（cron）と断念、手動再送、送信ログ一覧 / 詳細 / 加盟店タブ、デモ受信エンドポイント、限度額超過通知、KPI
- [x] **フェーズF 不正・リスク対策**（完了）: チャージバック（登録 → 異議申立て → 勝訴/敗訴 → 確定、取引ステータス `chargeback`、精算控除、Webhook）、カード識別ハッシュ / 接続元 IP と連続失敗検知（閾値設定）→ ブラックリスト候補 / 承認 / 手動追加 / 作成時ブロック、過不足入金一覧と対応ステータス（差額返金申請・追加入金案内）、KPI
- [x] **フェーズG レポート・通知**（完了）: 集計レポート（指標 7 種・推移 / 比率 / ランキングの SVG グラフ・集計 / 明細 CSV）、メールテンプレート（6 キー × 2 言語、プレースホルダー、プレビュー、有効 / 無効）と送信ログ（デモは記録のみ、`EMAIL_PROVIDER` で差し替え）、イベントフック（振込案内・決済完了・返金完了・追加入金案内・管理者招待）、お知らせ配信（下書き / 公開 / 終了、対象加盟店、障害の更新履歴、ヘッダーのバナー、加盟店 API）
- [x] **フェーズH 定期課金・決済リンク・代理店手数料**（完了）: 課金プラン（周期・無料期間・有効/無効）と定期課金（trialing / active / past_due / suspended / cancelled、毎時 cron の課金、3 日 → 7 日の再試行と 3 回で停止、Webhook・メール、今すぐ課金 / 一時停止 / 再開 / 解約、デモ失敗率）、決済リンク（URL / QR、公開決済ページ `/pay/<token>`、有効期限・最大利用回数、無効化）、代理店手数料（精算バッチ × 手数料率の月次集計、CSV、代理店詳細のサマリー）、KPI
- [x] **仕上げ**（完了）: マニュアル全章の精度向上、権限マトリクス、README 本番手順、残課題表
- [x] **未消込入金 / API 再通知**（完了）
- [x] **フェーズI ロール細分化・取引メモ・決済手段一時停止**（完了）: 5 ロール（admin / accounting / cs / developer / viewer）と `lib/role.ts` の権限マトリクス、`requirePermission` / `useCan`、取引メモ（タイムライン統合・ピン留め・削除の監査）、決済手段の全体 / 加盟店別停止（理由必須・自動再開 cron・赤バナー・障害お知らせ下書き）、通知テーブルと `emitNotification`（J の最小部分）、`GlobalSetting`（viewer の CSV 可否）
- [x] **フェーズJ 通知センター**（完了）: 14 種の通知を既存処理に組み込み（Webhook 断念・決済手段停止・バッチ失敗・チャージバック期限・振込 / コンビニ期限超過の日次まとめ・ブラックリスト候補・限度額超過・定期課金失敗・精算の生成 / 保留・返金申請・加盟店登録）、ヘッダーのベル + 未読バッジ + 最新 10 件、一覧（種別・重要度・既読 / 未読・期間、全既読）、管理者ごとのメール / Slack 設定、Slack Incoming Webhook の実送信（1 回リトライ・SlackLog）
- [x] **フェーズK コンビニ決済・領収書 PDF・インボイス**（完了）: 受付番号 13 桁・支払店舗・加盟店ごとの支払期限（申請一覧の支払待ちレーン・期限切れ cron・日次通知・入金通知 API `/api/demo/cvs-notify` は銀行振込と同じ `deposit`・決済リンクページ・案内メール）、領収書（月次連番・宛名・再発行回数・PDF・署名付き URL による顧客ダウンロード）、インボイス（発行者情報・登録番号検証・税区分・税率ごとの内税計算と端数処理・確定以降の精算バッチから請求書 PDF）。PDF は pdf-lib + Noto Sans JP サブセット同梱
- [x] **フェーズL 公開 API v1・加盟店ログイン・API ドキュメント**（完了）: `/api/v1`（取引の作成 / 取得 / 一覧、返金申請、決済リンク、OpenAPI 3 を Zod から生成しテストで route と照合）、加盟店 × 環境のレート制限（DB 計数、429 + Retry-After）、テストカード番号によるシナリオ、加盟店管理画面（別 Cookie のログイン・ロックアウト・取引 / 返金申請 / Webhook 再送 / 精算 + 請求書 PDF / テストキーの自己ローテーション / 決済手段の状態 / お知らせ）、公開 API ドキュメント（手書き 6 章 + 自動生成リファレンス）とサンドボックス
- [x] **フェーズM 顧客・PaymentToken・個人情報保護**（完了）: 加盟店 × ユーザーID の顧客マスタと保存カード（取引作成時に自動作成、既存行は冪等バックフィル）、管理画面全体のマスク表示（姓のみ / メール 2 文字 / 電話下 4 桁 / IP 第 4 オクテット、操作ログは保存時点でマスク）、監査付きマスク解除（admin / cs）、CSV の個人情報モード、手動匿名化（admin・理由必須）と保持期間による日次匿名化 + 操作ログの保持期間削除、加盟店管理画面の顧客一覧
- 全フェーズ完了。以降の追加は README の「残課題」から選ぶ
- 未実装フェーズのメニューは `lib/nav.ts` に定義済み（`implemented: false`）。実装時に `true` にする
- 既存一覧（取引・加盟店・代理店・IP制限）の `DataTable` 移行はフェーズC以降で順次行う
- 検索対象「カード下4桁」はフェーズF（カードハッシュ列）で追加する
