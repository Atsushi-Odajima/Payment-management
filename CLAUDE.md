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
- スキーマ変更は `npx prisma migrate dev --name xxx`（Docker 経路が `migrate deploy` を使うため、`db push` だけで済ませない）。本番（Vercel + Neon）は `prisma db push` で反映するため、**列の削除・型変更・NOT NULL 追加など破壊的変更は入れない**（追加は nullable か `@default` 付きで）
- seed（`prisma/seed-data.ts`）は **テーブル単位の upsert で冪等**。「データがあればスキップ」ではなく、固定 ID ごとに `upsert({ update: {} })` するので、既存 DB に新テーブルのサンプルだけを後から足せる。何度実行しても件数は増えない。新しいテーブルを足したら seed にもサンプルを追加し、`truncateAll` の削除順（子 → 親）にも加える

## アーキテクチャ・不変条件

- `app/**/page.tsx` は **Server Component**。Prisma で取得し、表示に必要な列だけを `select` して `components/views/*-view.tsx`（client）に渡す。**`credentials` 列を client に渡さない**（`providers/[id]` は `readCredentialsForDisplay` でマスク済みのみ）
- Server Component から `"use client"` モジュールの **関数や定数を import しない**（本番ビルドでは client reference になり `is not a function` で落ちる。dev では気づきにくい）。共有したいヘルパーは `lib/` に置く（例: `lib/pagination.ts` の `parsePage` / `DEFAULT_PAGE_SIZE`）。新しい画面を足したら `npm run build && npx next start` で実際に開いて確認する
- `lib/crypto.ts` を import できるのは `lib/providers/credentials.ts` だけ（ESLint `no-restricted-imports` で強制）。暗号鍵は本番で fail-closed
- 決済の状態遷移は `lib/payments/transitions.ts` の `TRANSITIONS` が唯一の定義。API/UI/Webhook は全てここから導出し、更新は `lib/payments/actions.ts` の `applyPaymentAction`（status 条件付き `updateMany` + `PaymentEvent` 記録）を通す。route に if 文で遷移ルールを書かない
- API レスポンスは `{ ok: true, data }` / `{ ok: false, error: { code, message } }` に統一（`lib/api/handler.ts` の `withApiHandler` でラップ）。client は `useApiJson()` を使う
- `/api/*` の非 GET は `middleware.ts` で rate limit → CSRF（Origin + `X-Requested-With: fetch`）→ `DEMO_READONLY` → セッション、の順に検査。Webhook（署名）と `/api/demo/reset`（`CRON_SECRET`）は独自認証
- 決済履歴は帳簿として扱う: プロバイダの `onDelete: Restrict`、決済を持つプロバイダは削除ではなく無効化。`livemode` は作成時にスナップショット

## 加盟店（Merchant）データと権限

- モデルは `prisma/schema.prisma` の `Merchant`。列: `merchantCode`（`MER-00001` 形式・自動採番・**変更不可**）, `passwordEnc`（AES-GCM 暗号化。**client に渡さない**。`app/api/merchants/select.ts` の `MERCHANT_SELECT` を使う）, `siteName`, `siteNameKana`（全角カタカナのみ）, `companyName`, `contactName`, `email`, `statementEmail`, `notifyUrl`（https 必須）, `notifyFormat`（`json_post | form_post | query_get`）, `notifyParamSet`（`minimal | standard | full`）, `notifyIdFormat`（`payment_id | transaction_id | both`）, `emailNotification`（`per_payment | daily | none`）
- 語彙と型ガードは `lib/merchants/types.ts`、検証は `lib/merchants/schema.ts`（フォームと API で同じ Zod。エラーは `merchantForm.errors.*` のコード）、採番は `lib/merchants/ids.ts`、パスワード生成/暗号化は `lib/merchants/secrets.ts`（`lib/crypto` を import してよい2つ目のモジュール）
- 通知サンプルは `lib/merchants/notification.ts` の `buildNotificationSample` が唯一の定義。README の仕様と一致させること
- `agentId`（任意）で担当代理店（`Agent`）を参照（`onDelete: SetNull`）。`enabledMethods` は利用可能な決済手段の JSON 配列（`"[]"` 既定）で、**決済申請の承認によってのみ追加される**（フォームからは編集しない）
- **権限（デモ用）**: `wirepay.role` cookie に `master | general`（`lib/role.ts`）。ヘッダーの `RoleToggle` で切替、`RoleProvider` で client に配布。マスター限定 API は **`lib/api/role-guard.ts` の `requireMaster(req)` を route の先頭で呼ぶ**（403 `role_required`）。対象: パスワードの表示・再発行（`/api/merchants/:id/password`）と決済申請の審査（`/api/applications/:id/review`）。UI 側の出し分けは `useRole().isMaster` による補助であり、権限判定の正はサーバー。route に `roleFromRequest` を直接書かない
- 本番ではこのトグルをユーザーのセッション由来のロールに置き換える（`lib/role.ts` と `RoleProvider` のみ変更すればよい）

## 代理店・決済申請・IP制限・マニュアル

トップページ（`app/page.tsx`）は 6 枚のカード（加盟店 / 代理店 / 決済一覧 / 決済申請 / IP制限 / マニュアル）で、決済一覧は `/payments` に移動済み。サイドバー（`components/app-shell.tsx`）も同じ 6 項目 + 「設定」のプロバイダ。各画面の `PageHeader` には `helpHref="/manual/<chapter>"` で該当章への「?」リンクを付ける。

- **Agent（代理店）**: `agentCode`（`AGT-00001`・自動採番・変更不可）, `name`, `nameKana`（全角カタカナ）, `companyName`, `contactName`, `email`, `feeRate`（% 小数2桁まで）, `status`（`active | disabled`）。語彙 `lib/agents/types.ts`、Zod `lib/agents/schema.ts`、採番 `lib/agents/ids.ts`、API `app/api/agents`。加盟店を持つ代理店も削除ではなく `disabled` にする
- **PaymentApplication（決済申請）**: 加盟店が PSP に対して決済手段の利用を申請するレコード。`applicationCode`（`APP-00001`）, `merchantId`（`onDelete: Cascade`）, `type`（`new_use | add_method | limit_change`）, `method`（`credit | qr | convenience | bank`）, `note`, `status`（`pending | approved | rejected | returned`）, `appliedAt`, `reviewedAt`, `reviewerNote`。審査は `lib/applications/review.ts` の `reviewApplication` が唯一の入口: `pending` 条件付き `updateMany`（409 `already_reviewed`）、`reject | return` は理由必須（400 `reason_required`）、`approve` は同一トランザクションで `Merchant.enabledMethods` に手段を追加。route に判定を書かない。申請の作成 UI は無い（加盟店ポータル側の想定。seed と API でのみ作成）
- **IpRestriction（IP制限）**: `target`（`admin | merchant_api`）, `merchantId`（`merchant_api` のとき必須）, `cidr`（IPv4 単体または CIDR。保存時に `normalizeCidr` でホストビットを落とす）, `label`, `enabled`。純関数は `lib/ip.ts`（`parseCidr` / `ipInCidr` / `evaluateAllowList` / `clientIpFromHeaders`）。一覧ページで現在の接続元 IP を `X-Forwarded-For` から読み、有効な `admin` ルールに対する判定（allowed / denied / no_rules / unsupported）を表示する。**middleware での実際の遮断は未実装**（デモの範囲外。導入時は `evaluateAllowList` を middleware から呼ぶ）
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
取消=Void（DB値は `cancelled`、アクション名は `cancel`） / チャージバック=Chargeback / コンビニ決済=Konbini Payments /
代理店=Agent / 決済申請=Payment Application / 審査中=Pending / 承認=Approve(d) / 否認=Reject(ed) / 差戻し=Return(ed) /
IP制限=IP Restriction / 許可リスト=Allow list / 手数料率=Fee rate
