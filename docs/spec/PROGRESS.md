# 仕様書作成の進捗 / Spec writing progress

対象コミット: 1.0.0 = `6b72a40`、1.1.0 = `cf1c153`（main）。**完了**（1.0.0: 2026-09-06、1.1.0: 2026-09-07 — 修正フェーズ1〜5 の実装変更を反映）。

| 成果物 | 状態 | 備考 |
|---|---|---|
| docs/spec/ja/A-merchant-integration-spec.md | 完了 | 章 1〜14 + 付録 A〜F + 改訂履歴（1.1.0: 付録 E 権限マトリクス（生成）・付録 F よくある問い合わせ） |
| docs/spec/ja/B-provider-connection-spec.md | 完了 | 章 1〜11 + 付録 A〜D + 改訂履歴（1.1.0: 付録 A を 3 枚に分割、付録 C ベンダー対応表・付録 D 要件一覧） |
| docs/spec/ja/glossary.md | 完了 | 9 分類の日英対訳 |
| docs/spec/en/A-merchant-integration-spec.md | 完了 | 日本語版と同じ構成で執筆 |
| docs/spec/en/B-provider-connection-spec.md | 完了 | 同上 |
| docs/spec/en/glossary.md | 完了 | |
| docs/spec/ASSUMPTIONS.md | 完了 | 仮決め 16 件（解消 1）、要確認 A: 3 件 / B: 10 件（解消 1）、不整合修正 8 件 |
| docs/spec/README.md | 完了 | 各文書の説明・版数・PDF 生成メモ |
| docs/spec/CHANGELOG.md | 完了 | 1.1.0 の破壊的変更 5 件・追加 11 件・動作変更 6 件・移行手順 |
| docs/spec/pdf/*.pdf | 完了 | 6 本。`node docs/spec/build-pdf.mjs`（Mermaid 全数描画、Noto Sans JP 埋め込み、1.1.0: `code` 折返し禁止・表 0.85em・幅の足りない表と横長の図を横向きページへ自動配置、`--png` で全ページを画像化して目視確認） |
| 実装との整合再チェック（grep） | 完了 | 1.1.0: API パスとエラーコードを再検査（`late-match` / `allowlist` / `deposit-notifications` / `merchant-daily-summary` / `invoice_no_missing` / `allowlist_no_rules` など新規分を含め全件ソースに存在）、表内コードの未エスケープ `\|` 0 件、`npm run check:permissions` 通過 |

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
| 14 未実装・今後の予定 | 済（1.1.0 で実装済み項目を除去） |
| 付録 A〜D | 済 |
| 付録 E 権限マトリクス（完全版）/ 付録 F よくある問い合わせ / 改訂履歴 | 済（1.1.0） |

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
| 付録 A〜B | 済（1.1.0: ER 図を 3 枚に分割） |
| 付録 C ベンダー通知の対応表 / 付録 D 要件一覧 / 改訂履歴 | 済（1.1.0） |

## 再開・更新の手順

1. 実装が変わったら該当章を更新し、`docs/spec/ASSUMPTIONS.md` の要確認箇所を見直す。
2. `npm install --no-save marked@12 mermaid@10 && CHROMIUM_BIN=<chromium> node docs/spec/build-pdf.mjs --png` で PDF を再生成し、`docs/spec/pdf/png/`（未コミット）の画像で図・表の崩れを確認する。
3. 版数（各文書冒頭・巻末の改訂履歴・README の更新履歴・用語集）と対象コミットを更新し、破壊的変更は `CHANGELOG.md` に理由付きで記録する。権限マトリクス（仕様書A 付録 E）は `npx tsx scripts/gen-permissions.ts` で再生成する。
