# Wire Pay 仕様書 / Wire Pay Specifications

決済管理システム Wire Pay の外部向け仕様書です。対象システムはコミット `cf1c153`（`main`、修正フェーズ1〜5 適用後）、各文書の版数は 1.1.0、更新日 2026-09-07（初版 1.0.0 は `6b72a40`、2026-09-06）。

| 文書 | 日本語 | 英語 | 対象読者 |
|---|---|---|---|
| **仕様書A** 加盟店・接続クライアント向け 統合仕様書 / Merchant & Connecting-Client Integration Specification | [ja/A-merchant-integration-spec.md](ja/A-merchant-integration-spec.md) | [en/A-merchant-integration-spec.md](en/A-merchant-integration-spec.md) | Wire Pay の API・管理画面を呼んで決済を利用する側: 加盟店、Wire Pay を経由する下位 PSP・ウォレット |
| **仕様書B** 決済プロバイダ接続仕様書 / Payment Provider Connection Specification | [ja/B-provider-connection-spec.md](ja/B-provider-connection-spec.md) | [en/B-provider-connection-spec.md](en/B-provider-connection-spec.md) | Wire Pay が決済処理を委託する先: カード会社・アクワイアラ、Stripe、PayPay 等のウォレット、コンビニ収納代行、バーチャル口座提供銀行、上位 PSP。Wire Pay 側で接続を実装・運用する開発者 |
| **用語集** / Glossary | [ja/glossary.md](ja/glossary.md) | [en/glossary.md](en/glossary.md) | 日英対訳と DB / API 値 |
| 仮決め・要確認一覧 | [ASSUMPTIONS.md](ASSUMPTIONS.md) | — | 無人作成時に仮決めした事項と「※要確認」箇所の理由 |
| 変更履歴 | [CHANGELOG.md](CHANGELOG.md) | — | 版ごとの破壊的変更（理由付き）・追加・動作変更・移行手順 |
| 進捗 | [PROGRESS.md](PROGRESS.md) | — | 章ごとの完了状況 |
| PDF | [pdf/](pdf/) | | 各仕様書の PDF（下記） |

## 記述方針

- 本文は実装（Prisma スキーマ、Route Handler、OpenAPI 定義、辞書、`lib/role.ts`、cron 定義、`content/manual`、`CLAUDE.md`）から確認できる事実のみ。
- 未実装・予定は各章末の「未実装・今後の予定」と最終章に分離。
- 推測を含む箇所は「※要確認」を付け、`ASSUMPTIONS.md` に列挙。
- 英語版は日本語版の翻訳ではなく同じ構成で執筆し、用語は用語集の対訳に統一。
- 図は Mermaid（ER 図・シーケンス図・状態遷移図）。GitHub 上でそのまま描画されます。

## PDF

`docs/spec/pdf/` に各 Markdown の PDF を置いています。生成は `node docs/spec/build-pdf.mjs`（リポジトリ同梱の Playwright + Chromium を使用。Markdown → HTML の変換と Mermaid のレンダリングはブラウザ内で行い、日本語はリポジトリ同梱の Noto Sans JP サブセット（`lib/pdf/fonts/`）を埋め込みます）。生成状況と制約は本 README の末尾「PDF 生成メモ」を参照してください。

## 更新履歴

| 版 | 日付 | 内容 |
|---|---|---|
| 1.0.0 | 2026-09-06 | 初版（コミット `6b72a40` を対象） |
| 1.1.0 | 2026-09-07 | 修正フェーズ1〜5 の実装変更を反映（コミット `cf1c153` を対象。破壊的変更は [CHANGELOG.md](./CHANGELOG.md) に理由付きで記録）。仕様書A に付録 E（権限マトリクス）・付録 F（よくある問い合わせ）、仕様書B に付録 C（ベンダー通知の対応表）・付録 D（要件一覧）、両書に改訂履歴を追加。PDF の可読性改善（下記） |

## PDF 生成メモ

<!-- pdf-notes:start -->
- 生成日: 2026-09-07（1.1.0）、6 ファイル（`ja-*` 3 本、`en-*` 3 本）。Mermaid 図は仕様書 A 11 / 11、仕様書 B 13 / 13（ER 図を 3 枚に分割）がレンダリングされ、横向きページに移した表・図の数とともに `pdf/build.json` に記録しています。
- ツール: `md-to-pdf` は Puppeteer の Chromium ダウンロードを要するため、リポジトリに同梱の Playwright + Chromium（`/opt/pw-browsers`）を使う `docs/spec/build-pdf.mjs` を用意しました。実行前に `npm install --no-save marked@12 mermaid@10` が必要です（`package.json` には追加していません）。
- 日本語フォント: システムフォントに依存せず、`lib/pdf/fonts/NotoSansJP-{Regular,Bold}.ttf`（JIS X 0208 サブセット、領収書 PDF と共用）を `@font-face` で埋め込んでいます。サブセット外の文字（一部の記号・第 2 水準外の漢字）はフォールバック（WenQuanYi Zen Hei）で描画されます。
- 可読性（1.1.0）: インラインコードは折り返さず（`white-space: nowrap`）、表は 0.85em。自然幅が本文幅の 1.15 倍を超える表と、幅 / 高さ比 1.35 超で本文幅より広い Mermaid 図は、生成時に **横向きページ**（CSS 名前付きページ `@page landscape`）へ自動で移します。`FILES` の `landscape: true` で文書全体を横向きにもできます。仕様書A 2.3 の状態遷移図は `direction TB`（縦）、仕様書B 付録 A の ER 図は取引系 / 精算系 / 設定・通知系の 3 枚で、いずれも 1 ページに収まります。
- 確認: `node docs/spec/build-pdf.mjs --png` で全ページを `pdf/png/`（`.gitignore` 済み）に画像化し、主要な図と表を目視確認しています。Mermaid の構文エラー（「Syntax error in text」として描画される図）はビルド時に `broken` として検出し、`build.json` の `rendered` から除きます（1.0.0 では英語版の 3 枚が構文エラーのまま数えられていました。ASSUMPTIONS I-9）。
- 制約: それでも A4 に収めるために縮小される図はあり、細部は Markdown（GitHub 表示）の方が読みやすい場合があります。PDF は Markdown を正とした派生物です。
<!-- pdf-notes:end -->
