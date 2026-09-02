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
- 決済（取引）の状態遷移は `lib/payments/transitions.ts` の `TRANSITIONS` が唯一の定義。ステータスは `pending`（申請中）/ `awaiting_transfer`（振込待ち）/ `authorized`（与信済）/ `captured`（完了）/ `partially_refunded` / `refunded` / `cancelled` / `failed` / `expired`、アクションは `capture | cancel | refund | fail | expire | deposit`。**決済申請一覧 = `APPLICATION_STATUSES`、決済一覧 = `SALES_STATUSES`** の同一テーブル・フィルタ違い（ローダは `lib/payments/list.ts` / `detail.ts` を両画面で共用）。API/UI/Webhook は全てここから導出し、更新は `lib/payments/actions.ts` の `applyPaymentAction`（status 条件付き `updateMany` + `PaymentEvent` 記録）を通す。route に if 文で遷移ルールを書かない。`refund` 以外のアクション（`MASTER_ACTIONS`）は `requireMaster`
- 銀行振込は `lib/payments/transfer.ts`（振込ID採番 `generateTransferId`・期限 `TRANSFER_DUE_DAYS`・消込 `reconcileDeposit`）。`deposit` は入金累計で判定し、一致 → `captured`、不足 → `awaiting_transfer` のまま `depositDiff="short"`、超過 → `captured` + `"excess"`。`expire` は `transferDueAt` 超過時のみ。`POST /api/demo/deposit-notify`（`DEPOSIT_NOTIFY_SECRET`）は同じ `applyPaymentAction` を actor `bank` で呼ぶ
- API レスポンスは `{ ok: true, data }` / `{ ok: false, error: { code, message } }` に統一（`lib/api/handler.ts` の `withApiHandler` でラップ）。client は `useApiJson()` を使う
- `/api/*` の非 GET は `middleware.ts` で rate limit → CSRF（Origin + `X-Requested-With: fetch`）→ `DEMO_READONLY` → セッション、の順に検査。Webhook（署名）と `/api/demo/reset`（`CRON_SECRET`）は独自認証
- 決済履歴は帳簿として扱う: プロバイダの `onDelete: Restrict`、決済を持つプロバイダは削除ではなく無効化。`livemode` は作成時にスナップショット

## 加盟店（Merchant）データと権限

- モデルは `prisma/schema.prisma` の `Merchant`。列: `merchantCode`（`MER-00001` 形式・自動採番・**変更不可**）, `passwordEnc`（AES-GCM 暗号化。**client に渡さない**。`app/api/merchants/select.ts` の `MERCHANT_SELECT` を使う）, `siteName`, `siteNameKana`（全角カタカナのみ）, `companyName`, `contactName`, `email`, `statementEmail`, `notifyUrl`（https 必須）, `notifyFormat`（`json_post | form_post | query_get`）, `notifyParamSet`（`minimal | standard | full`）, `notifyIdFormat`（`payment_id | transaction_id | both`）, `emailNotification`（`per_payment | daily | none`）
- 語彙と型ガードは `lib/merchants/types.ts`、検証は `lib/merchants/schema.ts`（フォームと API で同じ Zod。エラーは `merchantForm.errors.*` のコード）、採番は `lib/merchants/ids.ts`、パスワード生成/暗号化は `lib/merchants/secrets.ts`（`lib/crypto` を import してよい2つ目のモジュール）
- 通知サンプルは `lib/merchants/notification.ts` の `buildNotificationSample` が唯一の定義。README の仕様と一致させること
- `agentId`（任意）で担当代理店（`Agent`）を参照（`onDelete: SetNull`）。`enabledMethods` は利用可能な決済手段の JSON 配列（`lib/payments/methods.ts` の `PAYMENT_METHODS`、フォームのチェックボックスで編集）、`transferIdDigits`（7 | 8）は銀行振込の振込IDの桁数。`app/api/merchants/select.ts` の `toMerchantData` / `serialize` で JSON ⇄ 配列を変換する
- **権限（デモ用）**: `wirepay.role` cookie に `master | general`（`lib/role.ts`）。ヘッダーの `RoleToggle` で切替、`RoleProvider` で client に配布。マスター限定 API は **`lib/api/role-guard.ts` の `requireMaster(req)` を route の先頭で呼ぶ**（403 `role_required`）。対象: パスワードの表示・再発行（`/api/merchants/:id/password`）と取引の状態変更（`/api/payments/:id/:action` の `MASTER_ACTIONS`: capture / cancel / fail / expire / deposit。refund は対象外）。UI 側の出し分けは `useRole().isMaster` による補助であり、権限判定の正はサーバー。route に `roleFromRequest` を直接書かない
- 本番ではこのトグルをユーザーのセッション由来のロールに置き換える（`lib/role.ts` と `RoleProvider` のみ変更すればよい）

## 代理店・決済申請・IP制限・マニュアル

トップページ（`app/page.tsx`）は 6 枚のカード（加盟店 / 代理店 / 決済一覧 / 決済申請 / IP制限 / マニュアル）で、決済一覧は `/payments` に移動済み。サイドバー（`components/app-shell.tsx`）も同じ 6 項目 + 「設定」のプロバイダ。各画面の `PageHeader` には `helpHref="/manual/<chapter>"` で該当章への「?」リンクを付ける。

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

加盟店=Merchant / 決済代行=PSP / 返金=Refund / 入金=Deposit・Payout /
加盟店ID=Merchant ID / 売上確定=Capture / 与信=Authorization /
取消=Void（DB値は `cancelled`、アクション名は `cancel`。UI のステータス表示は「キャンセル / Cancelled」） / チャージバック=Chargeback / コンビニ決済=Konbini Payments /
代理店=Agent / 決済申請=Payment Application（取引 = Transaction） / 申請中=Applied（DB値 `pending`） / 振込待ち=Awaiting transfer / 与信済=Authorized / 完了=Completed（DB値 `captured`） / 期限切れ=Expired /
振込ID=Transfer ID / 振込期限=Transfer deadline / 入金消込=Deposit reconciliation / 不足=Short / 超過=Excess / 入金通知=Deposit notification /
IP制限=IP Restriction / ブロック=Block（DB値 `deny`） / 許可=Allow / 許可リスト=Allow list / 手数料率=Fee rate
