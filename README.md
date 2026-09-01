# Payment Management — 決済管理ダッシュボード

日本語 | [English](#english)

小規模ECストア向けに、複数の決済手段（クレジット / QR / コンビニ / 銀行振込 / その他Web決済）を一元管理できる管理画面です。

## 主な機能

- **決済プロバイダ接続フロー**: カテゴリ選択 → サービス選択 → 認証情報入力の3ステップで連携。
- **対応プロバイダ (初期)**:
  - クレジット: Stripe / Square / GMOペイメントゲートウェイ
  - QRコード: PayPay / au PAY / 楽天ペイ / d払い
  - コンビニ: ビットキャッシュ / スマートピット / Webコンビニ決済
  - 銀行振込: ペイジー / バーチャル口座 (GMOあおぞら・SBI・みずほ・楽天)
  - その他: カスタムWebhook連携
- **認証情報の暗号化保存**: AES-256-GCM でDBに保存。再表示時は末尾4文字以外マスク。
- **接続テスト**: 必須項目の充足や形式を即時検証。
- **決済の作成 / キャプチャ / 取消 / 返金**: デモ環境で各操作の動作確認が可能。
- **売上一覧 / ステータスフィルタ**: 注文番号・顧客・金額・状態を一覧表示。
- **ダッシュボード**: 累計売上・本日の売上・カテゴリ別接続数を一覧。
- **日本語 / 英語切り替え**: ヘッダーの「EN / 日本語」トグルでUI全体を切り替え。選択は localStorage に保存され、初回はブラウザ言語で自動判定。日付表記もロケールに追従（通貨は JPY 固定）。

## 技術スタック

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS
- Prisma + SQLite (本番は PostgreSQL 等に切替可能)
- Zod でリクエストバリデーション
- i18n は外部ライブラリ不使用（型付き辞書 + React Context の自前実装）

## iPhone・公開URLで確認したい場合

[`DEPLOY.md`](./DEPLOY.md) に Railway / Vercel+Neon / Cloudflare Pages の3通りの手順をまとめています。最短は Railway (SQLite のままコード変更ゼロで5分)。

## ローカル開発のセットアップ

```bash
# 1. 依存をインストール
npm install

# 2. 環境変数を設定
cp .env.example .env
# .env を編集し、ENCRYPTION_KEY を 32 バイトの base64 値に置き換える:
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 3. DB を初期化 & デモデータ投入 (任意)
npx prisma db push
npm run db:seed

# 4. 開発サーバ起動
npm run dev
# → http://localhost:3000
```

## ディレクトリ構成

```
app/
  page.tsx                 ダッシュボード
  providers/               決済プロバイダ管理 UI
    new/                   新規接続フロー (カテゴリ→サービス→フォーム)
    [id]/                  既存プロバイダの編集
  payments/                売上 / 決済管理 UI
    new/                   決済作成フォーム
    [id]/                  決済詳細・操作
  api/
    providers/             プロバイダ CRUD / 接続テスト
    payments/              決済 作成 / capture / cancel / refund
components/
  views/                   各画面の表示コンポーネント (client, i18n対応)
  language-provider.tsx    言語Context (localStorage永続化 / useT / useApiFetch)
lib/
  i18n/                    型付き翻訳辞書 (ja.ts / en.ts) とコア
  crypto.ts                AES-256-GCM 暗号化
  db.ts                    Prisma クライアント
  providers/
    registry.ts            プロバイダ定義 (文言は {ja, en} ペア)
    credentials.ts         認証情報の入出力 (マスク / 暗号化)
    connection.ts          接続テストロジック
prisma/
  schema.prisma            DB スキーマ
  seed.ts                  デモデータ投入スクリプト
```

## 本番化に向けて

このリポジトリは UI と設定保存 + デモ用の決済フローを実装しています。
本番に乗せる際は、以下を追加してください。

1. **管理者認証**: NextAuth / Auth.js などで管理画面にログインを追加。
2. **実 API 呼び出し**: `lib/providers/connection.ts` の `runConnectionTest` を各プロバイダの SDK (Stripe / PayPay / GMO PG …) を使った実装に差し替え。`app/api/payments/route.ts` の決済作成も同様に SDK 呼び出しへ。
3. **Webhook 受信**: 各プロバイダから決済結果通知を受け取る `app/api/webhooks/[provider]/route.ts` を追加し、署名検証 + 決済ステータス更新。
4. **DB の本番化**: `prisma/schema.prisma` の `provider` を `postgresql` に変更し、`DATABASE_URL` を本番DBへ。
5. **暗号鍵管理**: `ENCRYPTION_KEY` を KMS (AWS KMS / GCP KMS) で管理し、ローテーション戦略を整備。
6. **監査ログ**: プロバイダ設定変更・決済操作のログを別テーブルに保存。

## セキュリティ上のメモ

- シークレット類は AES-256-GCM で暗号化して DB に保存します。
- 管理画面で再表示する際は末尾4文字以外マスク。空欄での保存時は既存値を維持。
- HTTPS の終端、CSRF 対策、レートリミットは本番化時に必ず追加してください。

---

<a id="english"></a>

# Payment Management Dashboard

[日本語](#payment-management--決済管理ダッシュボード) | English

An admin dashboard for small e-commerce stores to manage multiple Japanese payment methods — credit cards, QR payments, konbini (convenience store) payments, bank transfers, and custom web integrations — in one place.

**Live demo:** https://payment-management-green.vercel.app

The demo runs in **demo mode**: no external payment APIs are called. Connection tests validate the submitted credentials' shape only, and payments are simulated records you can freely create, capture, void, and refund to explore the flows.

## Features

- **PSP connection flow** — connect a payment service provider in three steps: pick a category, pick a service, enter API credentials.
- **Supported providers (built-in registry)**
  - Credit cards: Stripe, Square, GMO Payment Gateway
  - QR payments: PayPay, au PAY, Rakuten Pay, d Payment
  - Konbini: BitCash, Smart Pit, multi-konbini payment
  - Bank transfer: Pay-easy, virtual accounts (GMO Aozora / SBI / Mizuho / Rakuten)
  - Other: custom webhook integration
- **Encrypted credential storage** — secrets are encrypted with AES-256-GCM at rest and shown masked (last 4 characters visible) in the UI.
- **Connection tests** — instant validation of required fields and URL formats, with results tracked per provider.
- **Payment lifecycle management** — create payments, then capture (settle), void, or refund them; every action is available from the payment detail screen.
- **Sales list with status filters** — browse payments by status (Pending / Authorized / Captured / Voided / Refunded) with order, customer, and amount details.
- **Dashboard** — total sales, today's sales, and connection counts per payment category at a glance.

## Language switching

The header on every screen has an **EN / 日本語** toggle:

- The choice is saved to `localStorage` and survives reloads.
- On first visit the language is auto-detected from the browser (`navigator.language`): Japanese browsers get Japanese, everything else gets English.
- Dates follow the locale (ja: `2026/09/01 12:34`, en: `Sep 1, 2026, 12:34 PM`); amounts stay in JPY (¥) in both languages.
- API error messages are localized too — the client sends its language in an `x-lang` header.

Implementation note: there is no i18n library. The two message catalogs (`lib/i18n/messages/ja.ts` and `en.ts`) are plain typed objects, and TypeScript enforces that they always contain exactly the same keys. Provider/category copy in the registry is stored as `{ja, en}` pairs next to the data.

## Tech stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS
- Prisma + SQLite (swappable to PostgreSQL for production)
- Zod for request validation
- Hand-rolled i18n (typed catalogs + React Context, zero dependencies)

## Running locally

```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables
cp .env.example .env
# Edit .env and set ENCRYPTION_KEY to a 32-byte base64 value:
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 3. Initialize the database & seed demo data (optional)
npx prisma db push
npm run db:seed

# 4. Start the dev server
npm run dev
# → http://localhost:3000
```

## Going to production

This repository implements the UI, encrypted settings storage, and a demo payment flow. To run it for real you would add: admin authentication, real provider SDK calls (replace `runConnectionTest` in `lib/providers/connection.ts` and the payment creation in `app/api/payments/route.ts`), webhook receivers with signature verification, a production database, KMS-managed encryption keys, and audit logging. See the Japanese section above for the detailed checklist.
