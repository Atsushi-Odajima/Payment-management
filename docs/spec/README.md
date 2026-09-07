# Wire Pay 仕様書 / Wire Pay Specifications

決済管理システム Wire Pay の外部向け仕様書です。対象システムはコミット `6b72a40`（`main`）、各文書の版数は 1.0.0、作成日 2026-09-06。

| 文書 | 日本語 | 英語 | 対象読者 |
|---|---|---|---|
| **仕様書A** 加盟店・接続クライアント向け 統合仕様書 / Merchant & Connecting-Client Integration Specification | [ja/A-merchant-integration-spec.md](ja/A-merchant-integration-spec.md) | [en/A-merchant-integration-spec.md](en/A-merchant-integration-spec.md) | Wire Pay の API・管理画面を呼んで決済を利用する側: 加盟店、Wire Pay を経由する下位 PSP・ウォレット |
| **仕様書B** 決済プロバイダ接続仕様書 / Payment Provider Connection Specification | [ja/B-provider-connection-spec.md](ja/B-provider-connection-spec.md) | [en/B-provider-connection-spec.md](en/B-provider-connection-spec.md) | Wire Pay が決済処理を委託する先: カード会社・アクワイアラ、Stripe、PayPay 等のウォレット、コンビニ収納代行、バーチャル口座提供銀行、上位 PSP。Wire Pay 側で接続を実装・運用する開発者 |
| **用語集** / Glossary | [ja/glossary.md](ja/glossary.md) | [en/glossary.md](en/glossary.md) | 日英対訳と DB / API 値 |
| 仮決め・要確認一覧 | [ASSUMPTIONS.md](ASSUMPTIONS.md) | — | 無人作成時に仮決めした事項と「※要確認」箇所の理由 |
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
| 1.1.0 | 作業中 | 修正フェーズ1〜5 の実装変更を反映（破壊的変更は [CHANGELOG.md](./CHANGELOG.md) に理由付きで記録） |

## PDF 生成メモ

<!-- pdf-notes:start -->
- 生成日: 2026-09-06、6 ファイル（`ja-*` 3 本、`en-*` 3 本）。Mermaid 図は仕様書 A / B とも 11 / 11 がレンダリングされ、`pdf/build.json` に記録しています。
- ツール: `md-to-pdf` は Puppeteer の Chromium ダウンロードを要するため、リポジトリに同梱の Playwright + Chromium（`/opt/pw-browsers`）を使う `docs/spec/build-pdf.mjs` を用意しました。実行前に `npm install --no-save marked@12 mermaid@10` が必要です（`package.json` には追加していません）。
- 日本語フォント: システムフォントに依存せず、`lib/pdf/fonts/NotoSansJP-{Regular,Bold}.ttf`（JIS X 0208 サブセット、領収書 PDF と共用）を `@font-face` で埋め込んでいます。サブセット外の文字（一部の記号・第 2 水準外の漢字）はフォールバック（WenQuanYi Zen Hei）で描画されます。
- 制約: Mermaid の図は A4 幅に収まるよう縮小されるため、大きな ER 図・シーケンス図は Markdown（GitHub 表示）の方が読みやすい場合があります。PDF は Markdown を正とした派生物です。
<!-- pdf-notes:end -->
