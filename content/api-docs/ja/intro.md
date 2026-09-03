# はじめに

Wire Pay の公開 API（v1）は、加盟店サイトから **決済の作成・参照・返金申請・決済リンクの発行** を行うための REST API です。リクエストとレスポンスはすべて JSON、金額は円の整数（JPY に小数はありません）です。

## 基本情報

| 項目 | 内容 |
|---|---|
| ベース URL | `https://<your-host>/api/v1` |
| 認証 | `Authorization: Bearer wp_test_ak_…` または `wp_live_ak_…` |
| 環境 | API キーの種類で **test / live** が決まります（同じエンドポイント） |
| レスポンス形式 | 成功 `{ "ok": true, "data": … }` / 失敗 `{ "ok": false, "error": { "code", "message" } }` |
| 冪等性 | `Idempotency-Key` ヘッダー（8〜128 文字）。同じキーでの再送は同じ取引を返します |
| レート制限 | 加盟店 × 環境ごとに 60 リクエスト / 分（超過は 429） |
| OpenAPI | `GET /api/v1/openapi.json` |

## 決済の流れ

1. `POST /transactions` で取引を作成します。`method` に応じて、クレジット / QR は即時完了（`captured`）または与信済（`authorized`）、コンビニは受付番号（`konbini.receiptNo`）、銀行振込は振込ID（`bankTransfer.transferId`）と期限が返ります。
2. コンビニ・銀行振込は顧客の支払い後に完了します。完了時は加盟店の通知先 URL に **Webhook**（`payment.completed`）が届きます。`GET /transactions/{id}` でも状態を確認できます。
3. 返金が必要になったら `POST /refunds` で申請します。Wire Pay が承認すると `refund.completed` の Webhook が届きます。

## 最小のサンプル

```
curl -X POST https://<your-host>/api/v1/transactions \
  -H 'Authorization: Bearer wp_test_ak_…' \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: order-2026-00042' \
  -d '{ "method": "credit", "orderNumber": "ORD-2026-00042", "amount": 4980, "customerEmail": "taro@example.com", "card": { "number": "4242424242424242", "expMonth": 12, "expYear": 2028 } }'
```

レスポンスの `data.status` が `captured` なら決済は完了しています。

## 加盟店管理画面

取引・返金・Webhook 送信ログ・精算・API キーは [加盟店管理画面](/merchant/login) からも確認できます。テストキーの発行と本番キーの扱いは「認証と環境」を参照してください。
