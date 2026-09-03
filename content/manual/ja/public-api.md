# 公開 API と API ドキュメント

加盟店サイトが直接呼び出す **公開 API（`/api/v1`）** と、その利用者向けドキュメント（`/docs/api`）の運用側の説明です。エンドポイントの仕様は [API ドキュメント](/docs/api) と `GET /api/v1/openapi.json` を正とします。

## 概要

| エンドポイント | 内容 |
|---|---|
| `POST /api/v1/transactions` | 取引を作成（クレジット / QR / コンビニ / 銀行振込） |
| `GET /api/v1/transactions` | 自加盟店の取引一覧（環境別、カーソルページング） |
| `GET /api/v1/transactions/{id}` | 取引 1 件 |
| `POST /api/v1/refunds` | 返金申請（管理画面と同じ審査フロー） |
| `POST /api/v1/payment-links` | 決済リンクの発行 |
| `GET /api/v1/openapi.json` | OpenAPI 3 定義（唯一の仕様。テストで route との整合を検査） |

- 認証は加盟店の **API キー**（Bearer。`wp_test_ak_` / `wp_live_ak_`）。加盟店と環境（テスト / 本番）はキーから決まり、リクエストで指定できません
- 加盟店の **IP 制限（merchant_api）**、**決済手段の停止**、**限度額**、**ブラックリスト** はすべて管理画面からの作成と同じ処理（`createTransaction`）で適用されます
- **レート制限**: 加盟店 × 環境ごとに 60 リクエスト / 分。DB のテーブル（`ApiRateLimit`）で数えるので複数インスタンスでも共有され、超過は 429 + `Retry-After`
- API から作られた取引は履歴の実行者が「公開 API」、操作ログの操作者が「加盟店（API / 加盟店画面）」になります

## テストカード番号

テスト環境では `card.number` にシナリオ別の番号を送ると成功 / 与信止まり / 各種失敗を再現できます（API ドキュメントの「テストカード番号」章、`lib/public-api/test-cards.ts`）。本番キーでテスト番号を送ると 400 `test_card_in_live` です。

## API ドキュメント（`/docs/api`）

- ログイン不要の公開ページです。左のガイド（はじめに / 認証と環境 / エラーとレート制限 / テストカード番号 / Webhook / サンドボックス）は `content/api-docs/{ja,en}/*.md` の手書き、下の **API リファレンス** は OpenAPI 定義から自動生成しています
- 設定ナビの「API ドキュメント」から開けます。加盟店には [加盟店管理画面](/manual/merchant-portal) のサンドボックスと合わせて案内してください

## 運用上の注意

- 本番キーの発行・ローテーション・失効は管理画面の加盟店詳細 → API キータブで行います（テストキーは加盟店が自分でローテーションできます）
- API の返金申請は `refund.request` として通知センターと返金管理に届きます。承認 / 否認は通常どおり admin / accounting が行います
