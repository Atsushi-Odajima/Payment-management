# 変更履歴 / Changelog

仕様書（docs/spec）と公開インターフェースの変更を記録します。**破壊的変更** は API 利用者（加盟店・銀行 / コンビニ側の接続）に影響する変更で、理由を付けて記載します。

Changes to the specifications (docs/spec) and to public interfaces. **Breaking changes** affect API consumers (merchants, bank / konbini integrations) and carry a reason.

## 1.1.0（2026-09-07）— 修正フェーズ1〜5

対象コミット: `cf1c153`（`main`。修正フェーズ1〜5 の実装を含む。フェーズ6 は仕様書・マニュアルのみの変更）。

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
| A-9 | `Receipt.description`（但し書き）と `source = merchant`。`POST/GET /api/merchant-portal/receipts/{paymentId}`（加盟店管理画面からの領収書発行、修正フェーズ3-8）。`POST /api/payments/{id}/receipt` に `description` を追加 |
| A-10 | 決済申請一覧の `?overdue=1`、精算バッチ明細の `orderNumber`、Webhook 送信ログ詳細の `payment` / `lastSuccess`、決済手段停止行の `suspendedByName`、過不足入金一覧の `refund` / `emailLog`、取引詳細の `depositNotifications` / `unmatchedCandidates`（修正フェーズ3、画面用の読み取り項目。公開 API には影響なし） |
| A-11 | seed（デモデータ）: テストモードの過不足入金 2 件（ORD-DEMO-017 不足 / ORD-DEMO-018 超過）、Webhook 送信ログを対象取引と再送間隔に整合（修正フェーズ5）。仕様への影響なし |
| A-8 | 加盟店設定「メール通知設定」を実装（修正フェーズ2-2）: テンプレート `merchant_payment_notice`（決済ごと、完了のたびに担当者メールへ）と `merchant_daily_summary`（1 日まとめて、`GET/POST /api/cron/merchant-daily-summary` が 09:00 JST に前日分を環境ごとに 1 通。0 件の日は送らない、再実行しても重複しない）。プレースホルダー 9 種を追加。加盟店管理画面ホームに現在の設定を表示 |

### 動作変更 / Behaviour changes

| # | 変更 | 理由 |
|---|---|---|
| C-1 | Webhook の署名で **加盟店パスワードへのフォールバックを廃止**（fail closed）。使用可能な署名シークレットが無い環境への通知は送信せず、`WebhookDelivery.status = failed`、`error: signing_secret_missing` で記録し、通知センターに警告を出す。シークレット発行後の再送で署名して送る | パスワードを署名鍵に流用すると、鍵の失効・ローテーションが管理できず、加盟店側の検証実装も二重になる |
| C-2 | 英語 UI のステータス `pending` の表示を "Applied" から "Pending" に変更 | `awaiting_payment` の追加に合わせて意味を正確にするため |
| C-3 | **`/api/merchant-api/*`（ping / announcements / settlements）にレート制限を適用**: 公開 API `/api/v1` と同じ加盟店 × 環境 × 分のバケットで 60 回 / 分。超過は 429 `rate_limited` + `Retry-After`、成功応答に `X-RateLimit-Limit` / `X-RateLimit-Remaining` | 旧 API だけ無制限で、同じキーからの過負荷を防げなかった。同じバケットにすることで合計の上限を 1 つにする（修正フェーズ2-3） |
| C-5 | **IP 制限の許可リストモード**（修正フェーズ4-1）: `GlobalSetting.ipAllowlistAdmin` / `ipAllowlistMerchantApi`（既定 OFF）。ON のとき、対象の有効な許可ルールに一致しない接続元を 403 `ip_blocked`（`details.reason = "not_in_allowlist"`）で遮断する。加盟店 API では `/api/merchant-api/*` と `/api/v1/*` の両方に適用（加盟店ごとの許可ルール、ルールの無い加盟店は影響なし）。ブロックルールは常に優先。`GET/PUT /api/ip-restrictions/allowlist` | 許可ルールが表示専用で実効性が無かった。既定 OFF で互換を保ちつつ、ON 時の自己ロックアウトを API 側で防ぐ |
| C-6 | 加盟店管理画面のサイドバーと加盟店ログイン画面の「管理画面（PSP）へ」リンクは `DEMO_LOGIN_HINT` 設定時のみ表示（修正フェーズ4-2）。加盟店ログインの入力欄は `name="merchant-code"` / `autoComplete="off"`（修正フェーズ4-3） | デモ専用の導線を本番に出さない。ブラウザが PSP 管理者 ID を加盟店IDに自動入力しないようにする |
| C-4 | クレジット / QR の即時完了取引でも決済完了メール `payment_completed` を顧客へ送信する（定期課金の課金は除外） | 手動完了・入金消込では送っていたのに即時完了だけ送られていなかった（修正フェーズ2-1） |

### 仕様書・マニュアル / Specifications and manuals（修正フェーズ6）

- 仕様書 A / B / 用語集（ja / en）を 1.1.0 に更新（各文書冒頭の版数・対象コミット、巻末の改訂履歴）。第 4 章冒頭の節番号参照（4.16 → 4.17）と 5.1 節の表内 `\|` の未エスケープを修正し、第 14 章の未実装一覧から実装済み項目を除去。
- 仕様書 A に付録 E「権限マトリクス（完全版）」（`scripts/gen-permissions.ts` が `lib/role.ts` から生成）と付録 F「よくある問い合わせ → 参照章」を追加。仕様書 B に付録 C「ベンダー通知の対応表（参考・未実装）」と付録 D「本番接続要件の一覧」を追加し、付録 A の ER 図を取引系 / 精算系 / 設定・通知系の 3 枚に分割。cron の表を `vercel.json` の実スケジュール（日次）と本番推奨（毎時）の 2 列に分離。
- PDF（`docs/spec/build-pdf.mjs`）: インラインコードの折返し禁止、表 0.85em、幅の足りない表と横長の図を横向きページへ自動配置、`--png` による全ページの画像化。仕様書 A 2.3 の状態遷移図を `direction TB` に変更。
- 管理画面マニュアル: コンビニ決済（`awaiting_payment`、入金通知の `mode` / `eventId`）、領収書（請求書番号の新形式）、はじめに（モード表示）を更新。他の章（決済申請の過不足入金・入金通知ログ・期限後入金、IP 制限の許可リストモード、メール、精算、Webhook、加盟店管理画面）は各修正フェーズで更新済み。

### 移行 / Migration

- `prisma migrate deploy`（SQLite / Docker）または `prisma db push --accept-data-loss`（Vercel + Neon）でスキーマを反映する。追加のみ（列削除・型変更なし）。
- `npm run db:backfill`（`scripts/backfill-phase1.ts`、冪等）で (1) `pending` + 受付番号ありのコンビニ取引を `awaiting_payment` に変換、(2) 確定以降の精算バッチに請求書番号を採番する。seed の末尾でも自動実行される。
- 加盟店の署名シークレット: 既存の加盟店で署名シークレットが無い環境は、API キータブから発行するまで Webhook が送信されない（送信ログと通知センターで検知できる）。
