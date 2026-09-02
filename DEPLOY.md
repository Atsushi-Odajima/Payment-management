# Deployment Guide

Wire Pay は Next.js 14 + Prisma のアプリです。公開環境は現在 **Vercel (東京 hnd1) + Neon Postgres** で動いています。Docker イメージも用意しており、Railway / Render / Fly.io などの PaaS でも動作します。

| 経路 | DB | スキーマ適用 | 用途 |
|------|----|-------------|------|
| **Vercel + Neon** (本番デモ) | Postgres | `prisma db push`（非破壊。破壊的変更はビルド失敗で止まる） | 公開デモ |
| **Docker** (Railway / Render / Fly) | SQLite on volume | `prisma migrate deploy`（`prisma/migrations`） | 自前ホスト・検証 |

> **経路が2つある理由**: `prisma/schema.prisma` は SQLite 用で、`scripts/prepare-prisma.mjs` がビルド時に `DATABASE_URL` を見て provider を `postgresql` に書き換えます。Prisma 5 は 1 スキーマで複数 provider を扱えないため、Postgres 側は migration 履歴を持たず `db push` で同期しています。Postgres 専用の migration 履歴に一本化するのは [README の Roadmap](./README.md#roadmap) 参照。

---

## 環境変数

| 変数 | 必須 | 用途 |
|------|------|------|
| `DATABASE_URL` | ✅ | `file:./dev.db`（SQLite） / `postgresql://…`（Neon 等） |
| `ENCRYPTION_KEY` | ✅ | AES-256-GCM 鍵。**base64 32 バイト**。本番は未設定・不正だと起動時に例外（fail-closed） |
| `ADMIN_PASSWORD` | 推奨 | 設定すると全ての更新操作（決済作成・確定・返金・プロバイダ変更）にログインが必要になる。未設定時は画面に警告バナー |
| `DEMO_LOGIN_HINT` | 任意 | ログイン画面に「デモ用パスワード: …」を表示（公開デモ用） |
| `SESSION_SECRET` | 任意 | セッション Cookie の HMAC 鍵。未設定時は `ENCRYPTION_KEY` を流用 |
| `DEMO_READONLY` | 任意 | `1` で DELETE とプロバイダの PATCH を 403 に（デモ荒らし対策） |
| `CRON_SECRET` | 任意 | 設定すると `GET/POST /api/demo/reset` が有効になり、Vercel Cron（毎日 03:00 JST）がデモデータを初期化 |

鍵の生成:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

---

## A. Vercel + Neon（現在の公開構成）

1. <https://neon.tech/> でプロジェクト作成 → **Pooled connection** の接続文字列をコピー
2. <https://vercel.com/new> → GitHub からこのリポジトリをインポート（`main` ブランチ）
3. Environment Variables に上表の値を設定（最低 `DATABASE_URL`, `ENCRYPTION_KEY`。公開デモなら `ADMIN_PASSWORD`, `DEMO_LOGIN_HINT`, `DEMO_READONLY=1`, `CRON_SECRET` も）
4. Deploy。`vercel.json` の buildCommand が以下を順に実行します:
   `prepare-prisma → prisma generate → prisma db push → next build → seed（空DBのときだけ投入）`
5. **Preview デプロイ用に Neon の Branch を別 DB として割り当てる**ことを推奨（Preview と Production が同じ DB を共有しないように）

`ENCRYPTION_KEY` を変更すると既存の暗号化済み認証情報は復号できなくなり、編集画面で「再入力が必要」と表示されます（500 にはなりません）。

---

## B. Docker（Railway / Render / Fly.io）

`Dockerfile` は `next build` の standalone 出力を `node` ユーザーで実行し、起動時に `prisma migrate deploy` を流します。SQLite を使うので `/data` に永続ボリュームをマウントしてください。

```bash
docker build -t wirepay .
docker run -p 3000:3000 \
  -e ENCRYPTION_KEY="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")" \
  -e ADMIN_PASSWORD=change-me \
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
2. `ADMIN_PASSWORD` を設定した場合は右上「ログイン」→ パスワード入力
3. **プロバイダ → 新規接続 → PayPay** などを選び、ダミーの認証情報で保存 → 接続テスト
4. **決済を作成** → 詳細画面で **売上を確定 / 一部返金 / 取消**、イベント履歴に記録されることを確認
5. Stripe プロバイダの決済で **Webhook をシミュレート** → 署名検証・重複排除を通って状態が変わる
6. スマホ幅では下部タブバーでナビゲーションできる
