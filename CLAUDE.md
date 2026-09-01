# CLAUDE.md

このリポジトリで作業する際のガイド。

## プロジェクト概要

小規模ECストア向けの決済管理ダッシュボード（デモアプリ）。
Next.js 14 App Router + TypeScript + Tailwind + Prisma(SQLite) + Zod。
外部決済APIは呼ばないデモモードで動作し、決済はDB上のダミーレコード。

- `npm run dev` — 開発サーバ
- `npm run build` — `prisma generate` + `next build`（コミット前に必ず通すこと）
- `npx tsc --noEmit` — 型チェック（コミット前に必ず通すこと）
- 初回は `.env` に `DATABASE_URL` と `ENCRYPTION_KEY`（32バイトbase64）が必要。`npx prisma db push && npm run db:seed` でDB準備

## アーキテクチャ

- `app/**/page.tsx` は **Server Component**。Prismaでデータ取得し、表示に必要なフィールドだけを明示的に select して `components/views/*-view.tsx`（client）に渡す。**credentials カラムを client に渡さないこと**（`providers/[id]` は `readCredentialsForDisplay` でマスク済みのみ渡す）
- `components/views/` — 各画面の表示コンポーネント（"use client"、i18n対応）
- `lib/providers/registry.ts` — プロバイダ/カテゴリ定義（文言データ込み）
- `lib/crypto.ts` — シークレットの AES-256-GCM 暗号化

## i18n 運用ルール（重要）

UIは日本語/英語対応。ヘッダーの「EN / 日本語」トグルで切替、選択は localStorage(`wirepay.lang`)、初回は `navigator.language` で判定。実装は自前（外部i18nライブラリ禁止・不要）。

### 新しいUI文字列を追加するとき

1. **必ず両言語の辞書に追加する**: `lib/i18n/messages/ja.ts`（マスター）と `en.ts` の同じ位置にキーを追加する。`en.ts` は `MessageShape<typeof ja>` 型なので、片方だけ追加すると**型エラーでビルドが落ちる**（これが正常な検知動作）
2. キーは画面/機能単位で構造化する（`dashboard.*`, `providerForm.*`, `errors.*` など）。パラメータは `{count}` 形式で埋め込み、`t("key", { count: n })` で補間
3. コンポーネント側では `useT()` フックで参照する。文字列をJSXに直接ハードコードしない（日本語・英語とも）

### データ内在文言（registry など）

- プロバイダ名・カテゴリ・フィールドラベル・helpText・selectオプションは辞書ではなく `LocalizedText` 型（`{ ja: "...", en: "..." }`）でデータの隣に書く。型で両言語必須
- 表示は `pickText(text, lang)`。client では `useLang()` の lang を使う
- placeholder は APIキー例など言語共通の技術文字列のみ plain string 可

### サーバー側（APIルート）の文言

- エラーメッセージは `translate(langFromRequest(req), "errors.xxx")` で生成する。クライアントの fetch は `useApiFetch()`（`x-lang` ヘッダ自動付与）を使うこと
- 新しいAPIを足すときも生の日本語/英語文字列を返さない

### 日付・通貨

- 日付は client では `useFormatDateTime()`、server では `lib/i18n` の `formatDateTime(date, lang)`。ja: `2026/09/01 12:34` / en: `Sep 1, 2026, 12:34 PM`
- 通貨は言語に関わらず **JPY (¥) 固定**。`formatYen()` を使う（ロケール切替しない）

### 翻訳漏れの検査

作業後に以下で日本語文字の残存を検査する（許容箇所: `lib/i18n/messages/ja.ts`、`lib/providers/registry.ts` の ja 側、`prisma/seed.ts` のデモデータ、`language-toggle.tsx` の「日本語」表記、`app/layout.tsx` / `app/manifest.ts` の静的メタデータ）:

```bash
grep -rlP '[ぁ-ゖァ-ヺ一-鿿]' app components lib --include='*.ts*' \
  | grep -v 'lib/i18n/messages/ja.ts' | grep -v 'lib/providers/registry.ts'
```

### 既知の制約

- SSRは常に日本語で描画し、マウント後に保存言語へ切り替える（localStorage はサーバから読めないため）。英語ユーザーには初回描画で一瞬日本語が見える
- `<html lang>` はクライアントで動的更新。ブラウザタブのタイトル等の静的メタデータ（`app/layout.tsx` の metadata / `app/manifest.ts`）は日本語固定

## 決済用語の対訳（変更しないこと）

加盟店=Merchant / 決済代行=PSP / 返金=Refund / 入金=Deposit・Payout /
加盟店ID=Merchant ID / 売上確定=Capture / 与信=Authorization /
取消=Void / チャージバック=Chargeback / コンビニ決済=Konbini Payments
