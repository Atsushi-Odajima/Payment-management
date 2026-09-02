# 通知パラメータ仕様

決済結果が確定したとき、Wire Pay は加盟店の **システム通知先 URL** にリクエストを送信します。送信内容は加盟店ごとの 3 つの設定で決まります。加盟店の追加・詳細画面では、設定に応じた **実際のリクエストのサンプル** をリアルタイムに確認できます。

## 1. 通知の型（送信方法）

| 設定 | メソッド | Content-Type | パラメータの位置 |
|---|---|---|---|
| JSON (POST) | POST | `application/json` | JSON ボディ |
| form-urlencoded (POST) | POST | `application/x-www-form-urlencoded` | ボディ |
| クエリパラメータ (GET) | GET | なし | URL のクエリ文字列 |

## 2. 送信パラメータセット（累積）

| セット | 含まれるパラメータ |
|---|---|
| 最小 | `merchant_id`, `amount`, `currency`, `paid_at`, `status` + 識別子 |
| 標準 | 最小 + `payment_method`, `user_id`, `product_id` |
| フル | 標準 + `domain`, `transaction_id`（識別子の設定に関わらず含む） |

## 3. 決済識別子の形式

| 設定 | 含まれる識別子 |
|---|---|
| 一意の決済IDのみ | `payment_id` |
| トランザクションIDのみ | `transaction_id` |
| 両方 | `payment_id`, `transaction_id` |

## パラメータ一覧

| 名前 | 型 | 説明 |
|---|---|---|
| `payment_id` | string | Wire Pay が発行する一意の決済 ID（例: `pay_01J9X4M8K2Q7Z3T6`） |
| `transaction_id` | string | 決済代行（PSP）側のトランザクション ID |
| `merchant_id` | string | 加盟店 ID（`MER-00001`） |
| `amount` | integer | 決済金額（円）。JSON では数値、それ以外は文字列 |
| `currency` | string | 通貨コード。常に `JPY` |
| `paid_at` | string | 決済日時。ISO 8601、JST（`2026-09-01T12:34:56+09:00`） |
| `status` | string | `captured` / `refunded` / `partially_refunded` / `cancelled` / `failed` |
| `payment_method` | string | `credit` / `qr` / `konbini` / `bank` / `other` |
| `user_id` | string | 加盟店側のユーザー ID（決済作成時に指定） |
| `product_id` | string | 商品 ID（決済作成時に指定） |
| `domain` | string | 決済が行われたサイトのドメイン |

## ヘッダー

| ヘッダー | 内容 |
|---|---|
| `Wirepay-Signature` | `t=<UNIX秒>,v1=<署名>`（下記） |
| `User-Agent` | `WirePay-Notify/1.0` |

## 署名の検証

`v1` は **HMAC-SHA256** で、鍵に **加盟店パスワード** を使います。

```
signed_payload = "<t>." + <リクエストボディ>     # GET の場合はクエリ文字列（先頭の ? を除く）
v1 = hex( HMAC_SHA256( key = 加盟店パスワード, message = signed_payload ) )
```

受信側の手順:

1. ヘッダーから `t` と `v1` を取り出す。
2. 同じ計算で `v1` を再計算し、定数時間比較で一致を確認する。
3. `t` が現在時刻から **5 分以上** ずれている場合は拒否する（リプレイ対策）。

## 再送と冪等性

- 応答が 2xx 以外、または 10 秒以内に応答が無い場合、**最大 5 回** まで指数バックオフで再送します。
- 同じ `payment_id`（または `transaction_id`）の通知は **複数回届く可能性** があります。受信側は冪等に処理してください。

## サンプル（JSON / 標準 / 一意の決済IDのみ）

```
POST https://shop.example.jp/wirepay/notify
Content-Type: application/json
Wirepay-Signature: t=1756697696,v1=3f0c9c5d...
User-Agent: WirePay-Notify/1.0

{
  "payment_id": "pay_01J9X4M8K2Q7Z3T6",
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
