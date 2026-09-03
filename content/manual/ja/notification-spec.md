# 通知パラメータ仕様

取引・返金・チャージバック・定期課金の状態が変わると、Wire Pay は加盟店の **システム通知先 URL** にリクエスト（Webhook）を送信します。送信内容は加盟店ごとの 3 つの設定で決まります。加盟店の追加・詳細画面（通知設定タブ）では、設定に応じた **実際のリクエストのサンプル** をリアルタイムに確認できます。送信の記録・再送は [Webhook 送信ログ](/manual/webhooks) を参照してください。

## 1. 通知の型（送信方法）

| 設定 | メソッド | Content-Type | パラメータの位置 | 署名対象 |
|---|---|---|---|---|
| JSON (POST) | POST | `application/json` | JSON ボディ（`amount` は数値、他は文字列） | リクエストボディそのもの |
| form-urlencoded (POST) | POST | `application/x-www-form-urlencoded` | ボディ | リクエストボディそのもの |
| クエリパラメータ (GET) | GET | なし | URL のクエリ文字列 | クエリ文字列（先頭の `?` を除く） |

## 2. 送信パラメータセット（累積）

| セット | 含まれるパラメータ |
|---|---|
| 最小 | 識別子 + `event`, `merchant_id`, `amount`, `currency`, `paid_at`, `status` |
| 標準 | 最小 + `payment_method`, `user_id`, `product_id` |
| フル | 標準 + `domain`, `transaction_id`（識別子の設定に関わらず含む） |

## 3. 決済識別子の形式

| 設定 | 含まれる識別子 |
|---|---|
| 一意の決済IDのみ | `payment_id` |
| トランザクションIDのみ | `transaction_id` |
| 両方 | `payment_id`, `transaction_id` |

## パラメータ一覧

パラメータの順序は「識別子 → 最小 → 標準 → フル」で固定です（フォーム / クエリの署名検証で順序が重要になるため、受信側は **受け取ったボディ / クエリ文字列をそのまま** 署名対象にしてください）。

| 名前 | 型 | 説明 |
|---|---|---|
| `payment_id` | string | Wire Pay が発行する一意の取引 ID（例: `pay_01J9X4M8K2Q7Z3T6`） |
| `transaction_id` | string | 決済代行（PSP）側のトランザクション ID。未取得なら空文字 |
| `event` | string | イベント名（下表）。受信側はまずこの値で分岐してください |
| `merchant_id` | string | 加盟店 ID（`MER-00001`） |
| `amount` | integer | 金額（円）。JSON では数値、それ以外は文字列。返金・チャージバックの通知でも **取引の金額** です |
| `currency` | string | 通貨コード。常に `JPY` |
| `paid_at` | string | 完了日時（未完了の取引は最終更新日時）。ISO 8601 / UTC（`2026-09-01T03:34:56.000Z`） |
| `status` | string | 下表を参照 |
| `payment_method` | string | `credit` / `qr` / `convenience` / `bank` / `other` |
| `user_id` | string | 加盟店側のユーザー ID（取引作成時の `customerId`。決済リンクではメールアドレスまたは `guest_…`） |
| `product_id` | string | 商品名 / 商品 ID（取引作成時の `productName`） |
| `domain` | string | システム通知先 URL のホスト名 |

### イベントと `status` の値

| `event` | 送信タイミング | `status` |
|---|---|---|
| `payment.completed` | 取引が完了になったとき（手動完了、決済リンクの完了、入金消込の一致 / 超過、加盟店サイトからの自動完了） | `captured` |
| `payment.failed` | 取引が失敗になったとき | `failed` |
| `payment.expired` | 振込期限超過で期限切れになったとき（毎時の自動処理を含む） | `expired` |
| `payment.cancelled` | 取引がキャンセル（取消）されたとき | `cancelled` |
| `refund.completed` | 返金が承認され完了したとき（旧 API の直接返金を含む） | `partially_refunded` / `refunded` |
| `limit.exceeded` | 加盟店の限度額超過で取引が失敗として記録されたとき | `failed:limit_exceeded:<per_transaction / daily / monthly>` |
| `chargeback.opened` | チャージバックが登録されたとき | 取引の現在のステータス |
| `subscription.charged` | 定期課金の課金が成功したとき（`payment_id` は課金の取引） | `captured` |
| `subscription.payment_failed` | 定期課金の課金が失敗し再試行待ちになったとき | `past_due` |
| `subscription.suspended` | 3 回目の失敗で契約が停止したとき | `suspended` |

## ヘッダー

| ヘッダー | 内容 |
|---|---|
| `X-Timestamp` | 送信時刻（UNIX 秒、文字列） |
| `X-Signature` | `v1=<署名（16 進 64 文字）>` |
| `Wirepay-Signature` | 互換用。`t=<X-Timestamp>,v1=<同じ署名>`。旧仕様で実装した受信側はこちらを使えます |
| `Content-Type` | POST のみ（上表） |
| `User-Agent` | `WirePay-Notify/1.0` |

## 署名の検証

```
signed_payload = "<X-Timestamp>" + "." + <署名対象>      # 署名対象は上表（ボディ、または GET のクエリ文字列）
v1 = hex( HMAC_SHA256( key = 署名鍵, message = signed_payload ) )
```

**署名鍵** は次の優先順位で決まります。

1. 加盟店の **署名シークレット**（加盟店詳細 → APIキータブで発行する `wp_<test|live>_ss_…`）。通知と同じモード（テスト / 本番）で、失効・期限切れでない最新のもの
2. 署名シークレットが 1 つも無い場合は **加盟店パスワード**

受信側の手順:

1. ヘッダーから `X-Timestamp` と `X-Signature` の `v1` を取り出す。
2. 受け取ったボディ（GET はクエリ文字列）をパースせず **そのまま** 使って `v1` を再計算し、**定数時間比較** で一致を確認する。
3. `X-Timestamp` が現在時刻から **5 分以上** ずれている場合は拒否する（リプレイ対策）。
4. 検証に成功したら `event` と `payment_id` で処理を分岐し、**2xx** を返す。

Node.js の例:

```js
import { createHmac, timingSafeEqual } from "node:crypto";

export function verify(req, rawBody, secret) {
  const ts = req.headers["x-timestamp"];
  const v1 = String(req.headers["x-signature"] ?? "").replace(/^v1=/, "");
  if (!ts || !v1 || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex");
  return expected.length === v1.length && timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}
```

## 再送と冪等性

- 応答が 2xx 以外、または **10 秒** 以内に応答が無い場合は失敗として記録し、**1 分 → 5 分 → 30 分 → 2 時間 → 24 時間** の間隔で最大 5 回まで自動再送します。5 回失敗すると断念し、管理画面から手動で再送できます。
- 同じ `payment_id` + `event` の通知は **複数回届く可能性** があります（再送・手動再送）。受信側は冪等に処理してください。
- 1 つの取引に対して複数のイベント（例: `payment.completed` → `refund.completed`）が届きます。順序は保証されないため、`paid_at` / `status` ではなく自システムの状態と `event` で判断してください。

## サンプル（JSON / 標準 / 一意の決済IDのみ）

```
POST https://shop.example.jp/wirepay/notify
Content-Type: application/json
X-Timestamp: 1756697696
X-Signature: v1=3f0c9c5d...
Wirepay-Signature: t=1756697696,v1=3f0c9c5d...
User-Agent: WirePay-Notify/1.0

{
  "payment_id": "pay_01J9X4M8K2Q7Z3T6",
  "event": "payment.completed",
  "merchant_id": "MER-00001",
  "amount": 4980,
  "currency": "JPY",
  "paid_at": "2026-09-01T12:34:56+09:00",
  "status": "captured",
  "payment_method": "credit",
  "user_id": "user_10293",
  "product_id": "SKU-2026-0042"
}
```

デモ環境では seed の加盟店の通知先が `/api/demo/webhook-receiver` になっており、`?result=ok|error|timeout` で応答を切り替えて再送の挙動を確認できます。
