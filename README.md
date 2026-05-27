# Payment Management — 決済管理ダッシュボード

小規模ECストア向けに、複数の決済手段（クレジット / QR / コンビニ / 銀行振込 / その他Web決済）を一元管理できる管理画面です。

## 主な機能

- **決済プロバイダ接続フロー**: カテゴリ選択 → サービス選択 → 認証情報入力の3ステップで連携。
- **対応プロバイダ (初期)**:
  - クレジット: Stripe / Square / GMOペイメントゲートウェイ
  - QRコード: PayPay / LINE Pay / 楽天ペイ / d払い
  - コンビニ: ビットキャッシュ / スマートピット / Webコンビニ決済
  - 銀行振込: ペイジー / バーチャル口座 (GMOあおぞら・SBI・みずほ・楽天)
  - その他: カスタムWebhook連携
- **認証情報の暗号化保存**: AES-256-GCM でDBに保存。再表示時は末尾4文字以外マスク。
- **接続テスト**: 必須項目の充足や形式を即時検証。
- **決済の作成 / キャプチャ / 取消 / 返金**: デモ環境で各操作の動作確認が可能。
- **売上一覧 / ステータスフィルタ**: 注文番号・顧客・金額・状態を一覧表示。
- **ダッシュボード**: 累計売上・本日の売上・カテゴリ別接続数を一覧。

## 技術スタック

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS
- Prisma + SQLite (本番は PostgreSQL 等に切替可能)
- Zod でリクエストバリデーション

## セットアップ

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
lib/
  crypto.ts                AES-256-GCM 暗号化
  db.ts                    Prisma クライアント
  providers/
    registry.ts            プロバイダ定義 (各種フィールドのスキーマ)
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
