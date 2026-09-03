# エラーとレート制限

## エラーレスポンス

失敗時は HTTP ステータスに加えて、次の形式のボディを返します。`message` はリクエストの `x-lang` ヘッダー（`ja` / `en`、既定 `ja`）の言語です。

```
{ "ok": false, "error": { "code": "invalid_input", "message": "入力内容に誤りがあります", "details": { "fieldErrors": { "amount": "too_small" } } } }
```

- `code` はプログラムで判定するための固定文字列です（下表）
- `details` はコードによって付きます。`invalid_input` では `fieldErrors` に項目ごとの理由が入ります

## リトライ

- `429 rate_limited` は `Retry-After` ヘッダー（秒）の後に再送してください
- `5xx` と通信エラーは **同じ `Idempotency-Key`** で再送すると二重作成を防げます
- `4xx`（429 以外）はリクエストを直してから送り直してください

## レート制限

加盟店 × 環境ごとに **1 分あたり 60 リクエスト** です。成功レスポンスには `X-RateLimit-Limit` / `X-RateLimit-Remaining` が付きます。

下の表はサーバーの定義から生成しています。
