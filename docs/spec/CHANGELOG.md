# 変更履歴 / Changelog

仕様書（docs/spec）と公開インターフェースの変更を記録します。**破壊的変更** は API 利用者（加盟店・銀行 / コンビニ側の接続）に影響する変更で、理由を付けて記載します。

Changes to the specifications (docs/spec) and to public interfaces. **Breaking changes** affect API consumers (merchants, bank / konbini integrations) and carry a reason.

## 1.1.0（作業中 / in progress）— 修正フェーズ1: 資金・整合性

対象コミット: 後述（フェーズ6 で確定）。

### 破壊的変更 / Breaking changes

| # | 変更 | 理由 |
|---|---|---|
| B-1 | 取引の `status` に **`awaiting_payment`**（コンビニ支払待ち）を追加。コンビニ取引は作成時に `pending` ではなく `awaiting_payment` になる。公開 API v1 の `GET /transactions` の `status` フィルタ・応答、Webhook の `status` パラメータ、加盟店 API の一覧に新しい値が現れる | コンビニの支払待ちが申請中（`pending`）の流用で、一覧で絞り込めず、期限切れ・入金消込の対象判定が受付番号の有無に依存していた。状態を独立させて `TRANSITIONS` から導出できるようにするため。**`pending` を「支払待ち」とみなしていた実装は `awaiting_payment` も扱うよう更新が必要** |
| B-2 | 入金通知 `POST /api/demo/deposit-notify` / `POST /api/demo/cvs-notify` の **`mode`（`test` / `live`）を必須化**。未指定は 400 `invalid_input`（`fieldErrors.mode = "required"`） | `mode` が未消込入金の環境にしか使われず、テストの入金通知で振込IDが一致すれば本番取引が完了する経路があった。環境の照合を必須にして資金の誤計上を防ぐため |
| B-3 | 入金通知で `mode` と取引の環境が一致しない場合、409 ではなく **202 `{ matched: false, reason: "mode_mismatch" }`** を返し未消込入金に登録する | 誤送信を記録に残して人が判断できるようにするため（拒否だけでは追跡できない） |
| B-4 | 期限切れ・キャンセル済の取引への入金通知は 409 ではなく **202 `{ matched: false, reason: "late_deposit" \| "cancelled_deposit", unmatchedDepositId, paymentId }`** を返す | 期限後に届いた入金が記録されず消えていた。未消込入金として保留し「期限後入金として消込」または組戻しで処理するため |
| B-5 | 精算バッチの **請求書番号の形式** を `INV-YYYYMM-<加盟店番号>` から **`INV-YYYYMM-<加盟店番号>-<連番 2 桁>`** に変更し、確定時に採番・保存する。加盟店 API `GET /api/merchant-api/settlements` の応答に `invoiceNo` を追加 | 15 日締め・週次締めで同月に複数バッチが立つと番号が重複していた |

### 追加 / Additions（互換）

| # | 変更 |
|---|---|
| A-1 | 入金通知に任意の `eventId`（≤ 128）を追加。同じ `eventId`（無ければ「送信元 \| 振込ID または受付番号 \| 金額 \| 入金日時（分）\| 銀行参照番号」のハッシュ）の再送は **200 `{ duplicate: true, notificationId, paymentId }`** で応答し、消込を再適用しない。応答に `notificationId` / `notificationNo` / `duplicate` を追加 |
| A-2 | `DepositNotification` テーブルと画面「入金通知ログ」（`GET /api/deposit-notifications`、CSV） |
| A-3 | 状態遷移 `late_deposit`（`expired` → `captured`、未消込入金画面の「期限後入金として消込」`POST /api/unmatched-deposits/{id}/late-match`）。完了時は `payment.completed` Webhook と決済完了メールを送る |
| A-4 | 未消込入金に `reason`（`late_deposit` / `cancelled_deposit` / `mode_mismatch`）・`candidatePaymentId`・`dismissKind`（`returned` = 組戻し手配 / `other`）を追加。`source` に `cvs` を追加。却下 API に `kind` を追加 |
| A-5 | 通知センターの種別 `deposit.late`（日次まとめ）と `webhook.signing_secret_missing` を追加 |
| A-6 | 加盟店の新規登録（`POST /api/merchants`）がテスト環境の署名シークレットを同時発行し、応答 `signingSecret.plaintext` で 1 回だけ返す |
| A-7 | `SettlementBatch.invoiceNo`（@unique）。横断検索が請求書番号で精算バッチを返す |
| A-8 | 加盟店設定「メール通知設定」を実装（修正フェーズ2-2）: テンプレート `merchant_payment_notice`（決済ごと、完了のたびに担当者メールへ）と `merchant_daily_summary`（1 日まとめて、`GET/POST /api/cron/merchant-daily-summary` が 09:00 JST に前日分を環境ごとに 1 通。0 件の日は送らない、再実行しても重複しない）。プレースホルダー 9 種を追加。加盟店管理画面ホームに現在の設定を表示 |

### 動作変更 / Behaviour changes

| # | 変更 | 理由 |
|---|---|---|
| C-1 | Webhook の署名で **加盟店パスワードへのフォールバックを廃止**（fail closed）。使用可能な署名シークレットが無い環境への通知は送信せず、`WebhookDelivery.status = failed`、`error: signing_secret_missing` で記録し、通知センターに警告を出す。シークレット発行後の再送で署名して送る | パスワードを署名鍵に流用すると、鍵の失効・ローテーションが管理できず、加盟店側の検証実装も二重になる |
| C-2 | 英語 UI のステータス `pending` の表示を "Applied" から "Pending" に変更 | `awaiting_payment` の追加に合わせて意味を正確にするため |
| C-3 | **`/api/merchant-api/*`（ping / announcements / settlements）にレート制限を適用**: 公開 API `/api/v1` と同じ加盟店 × 環境 × 分のバケットで 60 回 / 分。超過は 429 `rate_limited` + `Retry-After`、成功応答に `X-RateLimit-Limit` / `X-RateLimit-Remaining` | 旧 API だけ無制限で、同じキーからの過負荷を防げなかった。同じバケットにすることで合計の上限を 1 つにする（修正フェーズ2-3） |
| C-4 | クレジット / QR の即時完了取引でも決済完了メール `payment_completed` を顧客へ送信する（定期課金の課金は除外） | 手動完了・入金消込では送っていたのに即時完了だけ送られていなかった（修正フェーズ2-1） |

### 移行 / Migration

- `prisma migrate deploy`（SQLite / Docker）または `prisma db push --accept-data-loss`（Vercel + Neon）でスキーマを反映する。追加のみ（列削除・型変更なし）。
- `npm run db:backfill`（`scripts/backfill-phase1.ts`、冪等）で (1) `pending` + 受付番号ありのコンビニ取引を `awaiting_payment` に変換、(2) 確定以降の精算バッチに請求書番号を採番する。seed の末尾でも自動実行される。
- 加盟店の署名シークレット: 既存の加盟店で署名シークレットが無い環境は、API キータブから発行するまで Webhook が送信されない（送信ログと通知センターで検知できる）。
