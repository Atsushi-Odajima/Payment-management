# デプロイ手順 — iPhoneから確認するために

このアプリは Next.js + Prisma で作られているため、公開URLを発行できる Web ホスティングサービスに置けば iPhone のブラウザからそのまま閲覧・操作できます。簡単な順に3つの方法を載せました。

> どれも GitHub リポジトリ `Atsushi-Odajima/Payment-management` の `claude/payment-management-dashboard-nNGKs` ブランチをそのまま読み込みます。

---

## 🚆 オプション A: Railway (最も簡単・SQLite のまま動く)

Railway は Docker をそのままビルドして実行する PaaS で、永続ボリュームに SQLite を置けるので **コード変更ゼロ** でデプロイできます。**所要時間 5 分**。

1. <https://railway.app/> にサインアップ（GitHubアカウントでログイン可）。
2. **New Project → Deploy from GitHub repo** で本リポジトリを選択。
3. ブランチに `claude/payment-management-dashboard-nNGKs` を指定。
4. デプロイが始まったらサービスを開き、**Settings → Volumes → New Volume**
   - Mount Path: `/data`
   - Size: 1 GB
5. **Variables** タブで次を追加:
   - `ENCRYPTION_KEY`: 32バイトのbase64文字列。次のコマンドで生成:
     ```bash
     node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
     ```
   - `DATABASE_URL`: `file:/data/prod.db` (デフォルトのままでも可)
6. **Settings → Networking → Generate Domain** をクリックすると `https://xxxxx.up.railway.app` の公開URLが発行されます。これを iPhone のSafariで開けば完了です。

> Railway は無料試用クレジット付き。継続利用は月 \$5 から。

---

## ▲ オプション B: Vercel + Neon (Next.js の本拠地)

Vercel は Next.js の作者がホストしている PaaS で、ビルド速度・無料枠ともに優秀です。ただし SQLite は使えないので、**無料の PostgreSQL を Neon で発行して接続** します。**所要時間 10 分**。

### B-1. Neon で Postgres を発行

1. <https://neon.tech/> にサインアップ。
2. プロジェクトを作成し、`Pooled connection` の接続文字列をコピー（`postgresql://user:pass@host/dbname?sslmode=require` の形）。

### B-2. Prisma スキーマを Postgres 用に切り替え

`prisma/schema.prisma` の `datasource db` ブロックを書き換えてコミットします:

```diff
 datasource db {
-  provider = "sqlite"
+  provider = "postgresql"
   url      = env("DATABASE_URL")
 }
```

そして既存の SQLite マイグレーションを削除し、Postgres 用に作り直します（ローカルで実行）:

```bash
rm -rf prisma/migrations
# .env の DATABASE_URL を Neon の接続文字列に書き換えてから:
npx prisma migrate dev --name init
git add prisma/ && git commit -m "Switch to Postgres" && git push
```

### B-3. Vercel にインポート

1. <https://vercel.com/new> → GitHub から本リポジトリをインポート。
2. **Environment Variables** で:
   - `DATABASE_URL`: Neon の接続文字列
   - `ENCRYPTION_KEY`: 上記のbase64 32バイト
3. **Deploy** をクリック → `https://xxxxx.vercel.app` で公開されます。

> Vercel の Hobby プランは個人利用無料。

---

## ☁️ オプション C: Cloudflare Pages (上級者向け)

ご希望の Cloudflare で動かすことも可能ですが、Workers ランタイムは Node.js ファイルシステムを持たないため **SQLite は使えず**、Prisma も追加設定が必要です。具体的には:

1. DB は Cloudflare D1 か外部の PostgreSQL (Neon等) を使う
2. `@cloudflare/next-on-pages` アダプタを導入
3. Prisma を `Prisma Accelerate` 経由か、D1 ドライバ + `prisma/adapter-d1` で接続

すぐに iPhone で見たいなら、まず A (Railway) か B (Vercel) で動かしてから、後で Cloudflare に移すのが現実的です。

それでも Cloudflare で進めたい場合の概略:

```bash
npm install -D @cloudflare/next-on-pages wrangler
npx @cloudflare/next-on-pages
# wrangler.toml を作成、Pages プロジェクトを Cloudflare ダッシュボードで作成
# DATABASE_URL に Neon の接続文字列を、ENCRYPTION_KEY を Pages の環境変数に設定
wrangler pages deploy .vercel/output/static
```

詳細は <https://developers.cloudflare.com/pages/framework-guides/nextjs/> を参照してください。

---

## 🔑 必須の環境変数（どのオプションでも共通）

| 変数 | 用途 | 例 |
|------|------|----|
| `DATABASE_URL` | Prisma の接続先 | `file:/data/prod.db` (SQLite) / `postgresql://...` (Postgres) |
| `ENCRYPTION_KEY` | AES-256-GCM の鍵 (32バイト base64) | `xa9fT...==` |

`ENCRYPTION_KEY` を未設定で起動すると開発用フォールバック鍵で動作しますが、**本番では必ず固有の値を設定してください**。鍵を変更すると、既存の暗号化済み認証情報は復号できなくなります。

---

## 動作確認（デプロイ後）

1. `https://<your-domain>/` をiPhoneで開く → ダッシュボード表示
2. 「＋ 決済プロバイダを追加」→ カテゴリ → PayPay 等を選択
3. ダミーのAPIキーを入力して保存
4. 「決済を作成」でテスト決済 → ステータスが `売上確定` に変わることを確認

これで実機 (iPhone Safari/Chrome) から、すべての画面が同じUIで操作できます。
