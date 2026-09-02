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
- 初回は `.env` に `DATABASE_URL` と `ENCRYPTION_KEY`（32バイトbase64）が必要。`npx prisma migrate deploy && npm run db:seed` でDB準備
- スキーマ変更は `npx prisma migrate dev --name xxx`（Docker 経路が `migrate deploy` を使うため、`db push` だけで済ませない）

## アーキテクチャ・不変条件

- `app/**/page.tsx` は **Server Component**。Prisma で取得し、表示に必要な列だけを `select` して `components/views/*-view.tsx`（client）に渡す。**`credentials` 列を client に渡さない**（`providers/[id]` は `readCredentialsForDisplay` でマスク済みのみ）
- `lib/crypto.ts` を import できるのは `lib/providers/credentials.ts` だけ（ESLint `no-restricted-imports` で強制）。暗号鍵は本番で fail-closed
- 決済の状態遷移は `lib/payments/transitions.ts` の `TRANSITIONS` が唯一の定義。API/UI/Webhook は全てここから導出し、更新は `lib/payments/actions.ts` の `applyPaymentAction`（status 条件付き `updateMany` + `PaymentEvent` 記録）を通す。route に if 文で遷移ルールを書かない
- API レスポンスは `{ ok: true, data }` / `{ ok: false, error: { code, message } }` に統一（`lib/api/handler.ts` の `withApiHandler` でラップ）。client は `useApiJson()` を使う
- `/api/*` の非 GET は `middleware.ts` で rate limit → CSRF（Origin + `X-Requested-With: fetch`）→ `DEMO_READONLY` → セッション、の順に検査。Webhook（署名）と `/api/demo/reset`（`CRON_SECRET`）は独自認証
- 決済履歴は帳簿として扱う: プロバイダの `onDelete: Restrict`、決済を持つプロバイダは削除ではなく無効化。`livemode` は作成時にスナップショット

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

`npm run check:i18n`（`scripts/check-i18n.mjs`）。許容箇所: `lib/i18n/messages/ja.ts`、`lib/providers/registry.ts` の ja 側、`prisma/seed-data.ts` のデモデータ（日本のEC想定で意図的に日本語）、`language-toggle.tsx` の「日本語」表記、`app/manifest.ts` の両言語併記。

## 決済用語の対訳（変更しないこと）

加盟店=Merchant / 決済代行=PSP / 返金=Refund / 入金=Deposit・Payout /
加盟店ID=Merchant ID / 売上確定=Capture / 与信=Authorization /
取消=Void（DB値は `cancelled`、アクション名は `cancel`） / チャージバック=Chargeback / コンビニ決済=Konbini Payments
