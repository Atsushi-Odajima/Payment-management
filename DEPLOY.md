# Deployment Guide

Wire Pay は Next.js 14 + Prisma のアプリです。公開環境は現在 **Vercel (東京 hnd1) + Neon Postgres** で動いています。Docker イメージも用意しており、Railway / Render / Fly.io などの PaaS でも動作します。

| 経路 | DB | スキーマ適用 | 用途 |
|------|----|-------------|------|
| **Vercel + Neon** (本番デモ) | Postgres | `prisma db push --accept-data-loss`（デモ DB は毎日リセットされる使い捨てデータのため、警告で止めない） | 公開デモ |
| **Docker** (Railway / Render / Fly) | SQLite on volume | `prisma migrate deploy`（`prisma/migrations`） | 自前ホスト・検証 |

> **経路が2つある理由**: `prisma/schema.prisma` は SQLite 用で、`scripts/prepare-prisma.mjs` がビルド時に `DATABASE_URL` を見て provider を `postgresql` に書き換えます。Prisma 5 は 1 スキーマで複数 provider を扱えないため、Postgres 側は migration 履歴を持たず `db push` で同期しています。Postgres 専用の migration 履歴に一本化するのは [README の Roadmap](./README.md#roadmap) 参照。

---

## 環境変数

| 変数 | 必須 | 用途 |
|------|------|------|
| `DATABASE_URL` | ✅ | `file:./dev.db`（SQLite） / `postgresql://…`（Neon 等） |
| `ENCRYPTION_KEY` | ✅ | AES-256-GCM 鍵。**base64 32 バイト**。本番は未設定・不正だと起動時に例外（fail-closed） |
| `DEMO_LOGIN_HINT` | 任意 | 何か値を設定するとログイン画面にデモアカウント（`kuromaru` / `general`）を表示する（公開デモ用）。管理者は `AdminUser` テーブル（seed が作成）で、`ADMIN_PASSWORD` は使わない |
| `DEMO_GENERAL_PASSWORD` | 任意 | seed が作る一般権限アカウント `general` のパスワード（既定 `general1234`） |
| `SESSION_SECRET` | 任意 | セッション Cookie の HMAC 鍵。未設定時は `ENCRYPTION_KEY` を流用 |
| `DEMO_READONLY` | 任意 | `1` で DELETE とプロバイダの PATCH を 403 に（デモ荒らし対策） |
| `CRON_SECRET` | 本番は ✅ | 設定すると `/api/demo/reset` と `/api/cron/*`（下表）が `Authorization: Bearer <CRON_SECRET>` で有効になる。Vercel Cron はこのヘッダーを自動で付ける。未設定だと cron 系はすべて 404 になり、**振込期限切れ・Webhook 再送・定期課金の課金が動かない** |
| `DEPOSIT_NOTIFY_SECRET` | 任意 | `POST /api/demo/deposit-notify`（銀行の入金通知を模した消込 API）の Bearer トークン。未設定時は本番で 404、開発では認証なし |
| `APP_URL` | 本番は推奨 | 公開 URL（例 `https://wire-pay.example.com`）。加盟店の相対 `notifyUrl`（seed の `/api/demo/webhook-receiver`）を絶対 URL に解決する。未設定時は `VERCEL_PROJECT_PRODUCTION_URL` → `VERCEL_URL` → `http://localhost:3000` |
| `EMAIL_PROVIDER` | 任意 | `log`（既定。送信せず `EmailLog` に「デモ」として記録）/ `console`（記録 + 標準出力）。実サービスは `lib/email/send.ts` に `EmailProvider` を追加する |
| `EMAIL_DEFAULT_LANG` | 任意 | 顧客向けメール（振込案内・決済完了・返金完了・追加入金案内・定期課金）の言語。`ja`（既定）/ `en` |
| `SLACK`（環境変数ではなく全体設定） | — | Slack Incoming Webhook URL は環境変数ではなく管理画面の **全体設定** に保存する（admin）。未設定なら Slack 通知は送らない |
| `WEBHOOK_DELIVERY` | 任意 | `queue` にすると Webhook を即時送信せずキューに積み、毎時 30 分の `/api/cron/webhook-retry` がまとめて送る（既定は即時送信 + 失敗時リトライ） |

### Cron（`vercel.json`。他の PaaS では同等のスケジューラから `Authorization: Bearer <CRON_SECRET>` 付きで呼ぶ）

| パス | スケジュール（UTC） | 処理 |
|---|---|---|
| `/api/demo/reset` | `0 18 * * *`（03:00 JST） | デモデータを全削除して seed し直す（公開デモ専用。実データの環境では **登録しない**） |
| `/api/cron/expire-transfers` | `0 * * * *` | 振込期限を過ぎた振込待ちの取引を期限切れにし、Webhook `payment.expired` を送る |
| `/api/cron/webhook-retry` | `30 * * * *` | 再送時刻が来た Webhook（リトライ待ち / 送信待ち）を送信する |
| `/api/cron/subscriptions` | `15 * * * *` | 次回課金日を過ぎた定期課金を課金する（失敗は 3 日 / 7 日後に再試行、3 回で停止） |
| `/api/cron/payment-method-controls` | `45 * * * *` | 自動再開予定日時を過ぎた決済手段の停止を解除する |
| `/api/cron/notifications` | `50 * * * *` | 通知センターの日次まとめ（振込期限超過・チャージバック期限）と、メール / Slack の未配信通知の配信 |

すべて `GET` / `POST` の両方を受け付け、`CRON_SECRET` 未設定時は 404 を返します。

鍵の生成:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

---

## 本番デプロイ手順（チェックリスト）

デモではなく実データで運用する場合の最短手順です。

1. **DB を用意**: Neon（Postgres）でプロジェクトを作り、Pooled connection の URL を `DATABASE_URL` に設定する
2. **環境変数**: `ENCRYPTION_KEY`（base64 32 バイト、**一度決めたら変えない**）、`SESSION_SECRET`（別鍵を推奨）、`CRON_SECRET`、`DEPOSIT_NOTIFY_SECRET`、`APP_URL`（公開 URL）、必要なら `EMAIL_PROVIDER` / `EMAIL_DEFAULT_LANG`。`DEMO_LOGIN_HINT` と `DEMO_READONLY` は **設定しない**
3. **スキーマ適用**: `vercel.json` の buildCommand は `prisma db push --accept-data-loss` を実行する。実データを持つ DB では **このフラグを外す** か、Docker 経路と同じく `prisma migrate deploy`（`prisma/migrations` の履歴）に切り替える。スキーマ変更は常に「追加のみ」（nullable か `@default` 付き）で行い、列の削除・型変更をしない
4. **初期データ**: ビルド末尾の `tsx prisma/seed.ts` はテーブル単位の upsert で、**デモ加盟店・取引・管理者（`kuromaru` / `general`）を投入する**。実運用では seed をビルドから外し（`vercel.json` の `&& tsx prisma/seed.ts` を削除）、管理者は `scripts/` から手動で作るか、初回のみ seed → 不要な行を削除 → デモ管理者のパスワードを変更する
5. **Cron**: 上表の `/api/cron/expire-transfers`・`/api/cron/webhook-retry`・`/api/cron/subscriptions` を登録し、`/api/demo/reset` は **登録しない**（Vercel は `vercel.json` の `crons` から該当行を削除）
6. **加盟店の設定**: 各加盟店の通知先 URL（https）と署名シークレット（APIキータブ）を発行し、加盟店側で `X-Signature` の検証を実装してもらう（マニュアル「通知パラメータ仕様」）
7. **動作確認**: `GET /api/merchant-api/ping` をテストキーで呼ぶ → 200、`/api/cron/subscriptions` を `Authorization: Bearer <CRON_SECRET>` で呼ぶ → 200、未設定のヘッダーでは 401 を確認する
8. **運用上の前提**: 決済プロバイダの実 API・実メール送信・実際の銀行入金連携は未接続（README の「残課題」参照）。`lib/providers/*` にプロバイダごとのアダプタ、`lib/email/send.ts` に `EmailProvider`、`/api/demo/deposit-notify` に銀行連携を差し込む

---

## A. Vercel + Neon（現在の公開構成）

1. <https://neon.tech/> でプロジェクト作成 → **Pooled connection** の接続文字列をコピー
2. <https://vercel.com/new> → GitHub からこのリポジトリをインポート（`main` ブランチ）
3. Environment Variables に上表の値を設定（最低 `DATABASE_URL`, `ENCRYPTION_KEY`。公開デモなら `DEMO_LOGIN_HINT`, `DEMO_READONLY=1`, `CRON_SECRET` も）
4. Deploy。`vercel.json` の buildCommand が以下を順に実行します:
   `prepare-prisma → prisma generate → prisma db push --accept-data-loss → next build → seed（テーブル単位の upsert。既存 DB でも新テーブルのサンプルだけが追加され、何度実行しても件数は増えない）`
   **`--accept-data-loss` を付ける理由**: `db push` は非対話環境では「一意制約の追加」「テーブル削除」などの *警告* があるだけでエラー終了する。デモ DB はダミーデータで毎日リセットされるため受け入れている。実データを持つ本番 DB に使う場合はこのフラグを外し、`prisma migrate deploy`（migration 履歴）に切り替えること。
   入金通知 API（`/api/demo/deposit-notify`）を本番で使う場合は `DEPOSIT_NOTIFY_SECRET` を設定する（未設定なら本番では 404）。
5. **Preview デプロイ用に Neon の Branch を別 DB として割り当てる**ことを推奨（Preview と Production が同じ DB を共有しないように）
6. **push してもデプロイが作られないとき**: Vercel の Settings → Git → **Require Verified Commits** が有効（チーム設定から継承）だと、署名のないコミット（手元や外部環境からの `git push`。GitHub 上で「Verified」バッジが付かないもの）は **エラーにならず静かにデプロイ対象から外れます**。この設定を「Not required」にするか、GitHub の Web UI / API 経由（自動署名される）でコミットするか、Settings → Git の **Deploy Hooks** で `main` を手動デプロイしてください。

7. **Build Logs の末尾が `EncryptionKeyError: ENCRYPTION_KEY must be a base64-encoded 32-byte value` で終わるとき**: ビルドの最後に走る seed がデモ用の認証情報を暗号化するため、Vercel の `ENCRYPTION_KEY` が未設定・形式違い（hex、32 文字の文字列、引用符付きなど）だとここで止まります。Settings → Environment Variables で **Production と Preview** の `ENCRYPTION_KEY` を上のコマンドで生成した値（44 文字、末尾 `=`）に置き換えて **Redeploy** してください。鍵を変えると旧鍵で暗号化された行は復号できなくなりますが、デモ DB は `CRON_SECRET` 付きの `POST /api/demo/reset`（または毎日の Cron）で初期化されるので問題ありません。

`ENCRYPTION_KEY` を変更すると既存の暗号化済み認証情報は復号できなくなり、編集画面で「再入力が必要」と表示されます（500 にはなりません）。

---

## B. Docker（Railway / Render / Fly.io）

`Dockerfile` は `next build` の standalone 出力を `node` ユーザーで実行し、起動時に `prisma migrate deploy` を流します。SQLite を使うので `/data` に永続ボリュームをマウントしてください。

```bash
docker build -t wirepay .
docker run -p 3000:3000 \
  -e ENCRYPTION_KEY="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")" \
  -v wirepay-data:/data \
  wirepay
```

- **Railway**: New Project → Deploy from GitHub → Settings → Volumes → Mount Path `/data`。`railway.toml` 同梱
- **Render**: `render.yaml` 同梱（Blueprint）。`ENCRYPTION_KEY` は base64 32 バイトを手動で設定してください（自動生成値は形式が合いません）
- **Fly.io**: `fly launch` 後、`fly volumes create wirepay_data` して `/data` にマウント

Docker 経路は `.dockerignore` により `.env` / ローカル DB / `.git` をイメージに含めません。

---

## C. Cloudflare Pages（参考）

Workers ランタイムは Node.js のファイルシステムを持たないため SQLite は使えず、Prisma も追加設定（D1 アダプタ or Prisma Accelerate）が必要です。まず A か B で動かしてから検討することを推奨します。

---

## 動作確認（デプロイ後）

1. `/` を開く → ダッシュボード。右上の **EN / 日本語** で言語が切り替わり、リロード後も維持される
2. トップページでログイン（seed のマスター `kuromaru` / `atusi0130`）。右上の氏名からアカウント設定（パスワード変更・二段階認証）
3. **プロバイダ → 新規接続 → PayPay** などを選び、ダミーの認証情報で保存 → 接続テスト
4. **決済を作成** → 詳細画面で **完了 / 一部返金 / キャンセル**（マスター権限）、銀行振込は **入金消込**。ステータス変更履歴に記録されることを確認。未完了の取引は **決済申請一覧** に、完了後は **決済一覧** に表示される
5. Stripe プロバイダの決済で **Webhook をシミュレート** → 署名検証・重複排除を通って状態が変わる
6. スマホ幅では下部タブバーでナビゲーションできる
