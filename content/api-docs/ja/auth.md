# 認証と環境

## API キー

すべてのリクエストに `Authorization: Bearer <API キー>` を付けます。キーは Wire Pay が発行し、平文は発行時に一度だけ表示されます（保存されているのはハッシュのみ）。

| 接頭辞 | 環境 | 用途 |
|---|---|---|
| `wp_test_ak_` | test | 開発・検証。テストカード番号が使え、実際の請求は発生しません |
| `wp_live_ak_` | live | 本番。テストカード番号は拒否されます（`test_card_in_live`） |
| `wp_test_ss_` / `wp_live_ss_` | — | **署名シークレット**。API 認証には使えません。Webhook の署名検証に使います |

- キーの環境がデータの環境を決めます。テストキーで作った取引は本番キーからは見えません（404）
- 失効（revoked）・期限切れ（expired）のキーは 401 `invalid_api_key` になります。ローテーション後の旧キーは猶予期間（既定 7 日）だけ有効です
- 加盟店に **IP 制限（merchant_api）** が設定されている場合、許可されない接続元は 403 `ip_blocked` です

## ローテーション

- テストキーは [加盟店管理画面 → API キー](/merchant/api-keys) で自分でローテーションできます
- 本番キーの発行・ローテーション・失効は Wire Pay の管理者が行います

## 有効な決済手段

`POST /transactions` の `method` は加盟店契約で有効化された手段だけが使えます（それ以外は 400 `method_not_enabled`）。Wire Pay または加盟店単位で一時停止中の手段は 409 `method_suspended` です。停止状況は [加盟店管理画面 → 決済手段の状態](/merchant/methods) で確認できます。

## 接続テスト

```
curl https://<your-host>/api/v1/transactions?limit=1 -H 'Authorization: Bearer wp_test_ak_…'
```

`ok: true` が返れば認証は成功しています。
