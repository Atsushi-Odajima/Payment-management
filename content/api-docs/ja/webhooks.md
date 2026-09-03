# Webhook

取引の状態が変わると、加盟店の **通知先 URL** に Wire Pay から HTTP リクエストが届きます。形式（JSON POST / フォーム POST / クエリ GET）・パラメータセット・識別子の種類は加盟店設定に従います。

## イベント

| イベント | タイミング |
|---|---|
| `payment.completed` | 決済完了（クレジットの売上確定、コンビニ・銀行振込の入金確認） |
| `payment.failed` / `payment.expired` / `payment.cancelled` | 失敗・期限切れ・キャンセル |
| `refund.completed` | 返金申請が承認され完了した |
| `chargeback.opened` | チャージバックを受け付けた |
| `limit.exceeded` | 限度額超過で取引が失敗した |
| `subscription.charged` / `subscription.payment_failed` / `subscription.suspended` | 定期課金 |

## 署名の検証

すべての通知に次のヘッダーが付きます。

```
X-Timestamp: 1756700000
X-Signature: v1=<HMAC-SHA256(secret, "<X-Timestamp>.<payload>")>
```

- `secret` は加盟店の **署名シークレット**（`wp_test_ss_…` / `wp_live_ss_…`。同じ環境の最新の有効なもの）です。署名シークレットが未発行の場合は加盟店パスワードが使われます
- `payload` は JSON POST / フォーム POST ではリクエストボディ、クエリ GET ではクエリ文字列です
- `X-Timestamp` が現在時刻から 5 分以上離れている通知は破棄することを推奨します
- 互換のため `Wirepay-Signature: t=<timestamp>,v1=<signature>` も送ります

## 再送

- 応答が 2xx 以外またはタイムアウト（10 秒）のときは 1 分 → 5 分 → 30 分 → 2 時間 → 24 時間の間隔で最大 5 回再送し、その後は断念します
- [加盟店管理画面 → Webhook 送信ログ](/merchant/webhooks) から手動で再送できます
- 通知は **冪等に** 処理してください（同じ取引の `payment.completed` が複数回届くことがあります）
