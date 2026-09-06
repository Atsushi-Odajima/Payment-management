# 仕様書作成の進捗 / Spec writing progress

対象コミット: `6b72a40`（main）。**完了**（2026-09-06）。

| 成果物 | 状態 | 備考 |
|---|---|---|
| docs/spec/ja/A-merchant-integration-spec.md | 完了 | 章 1〜14 + 付録 A〜D |
| docs/spec/ja/B-provider-connection-spec.md | 完了 | 章 1〜11 + 付録 A〜B |
| docs/spec/ja/glossary.md | 完了 | 9 分類の日英対訳 |
| docs/spec/en/A-merchant-integration-spec.md | 完了 | 日本語版と同じ構成で執筆 |
| docs/spec/en/B-provider-connection-spec.md | 完了 | 同上 |
| docs/spec/en/glossary.md | 完了 | |
| docs/spec/ASSUMPTIONS.md | 完了 | 仮決め 12 件、要確認 A: 3 件 / B: 9 件、不整合修正 3 件 |
| docs/spec/README.md | 完了 | 各文書の説明・版数・PDF 生成メモ |
| docs/spec/pdf/*.pdf | 完了 | 6 本。`node docs/spec/build-pdf.mjs`（Mermaid 11/11 描画、Noto Sans JP 埋め込み） |
| 実装との整合再チェック（grep） | 完了 | API パス 64 件（実在しないものは接頭辞・将来案のみ）、Prisma モデル名 0 件不一致、エラーコードはテンプレート生成の `link_*` / `signature_*` を除き全件ソースに存在 |

## 仕様書A（ja / en）章別

| 章 | 状態 |
|---|---|
| 1 概要とシステム構成 | 済 |
| 2 用語と取引のライフサイクル | 済 |
| 3 アカウントと権限 | 済 |
| 4 管理画面の操作説明 | 済 |
| 5 API 仕様 | 済 |
| 6 Webhook 仕様 | 済 |
| 7 決済フローの詳細 | 済 |
| 8 返金・取消・チャージバック | 済 |
| 9 精算 | 済 |
| 10 セキュリティと制限 | 済 |
| 11 通知 | 済 |
| 12 テストとサンドボックス | 済 |
| 13 接続チェックリスト | 済 |
| 14 未実装・今後の予定 | 済 |
| 付録 A〜D | 済 |

## 仕様書B（ja / en）章別

| 章 | 状態 |
|---|---|
| 1 概要 | 済 |
| 2 決済手段ごとの接続方式 | 済 |
| 3 入金通知・結果通知の受信仕様 | 済 |
| 4 識別子の対応 | 済 |
| 5 消込と過不足処理 | 済 |
| 6 与信・売上・取消・返金・チャージバック | 済 |
| 7 精算と資金の流れ | 済 |
| 8 障害時の運用 | 済 |
| 9 セキュリティ要件 | 済 |
| 10 新規プロバイダを追加する手順 | 済 |
| 11 未実装・今後の予定 | 済 |
| 付録 A〜B | 済 |

## 再開・更新の手順

1. 実装が変わったら該当章を更新し、`docs/spec/ASSUMPTIONS.md` の要確認箇所を見直す。
2. `npm install --no-save marked@12 mermaid@10 && node docs/spec/build-pdf.mjs` で PDF を再生成する。
3. 版数（各文書冒頭と README の更新履歴）と対象コミットを更新する。
