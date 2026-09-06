# 仕様書作成の進捗 / Spec writing progress

対象コミット: `6b72a40`（main）。この表を見て途中から再開する。章は 1 つずつ追記し、仕様書ごとに commit する。

| 成果物 | 状態 | 備考 |
|---|---|---|
| docs/spec/ja/A-merchant-integration-spec.md | **完了（草稿）** | 章 1〜14 + 付録 A〜D。整合再チェック待ち |
| docs/spec/ja/B-provider-connection-spec.md | 作業中 | 章 1〜11 + 付録 |
| docs/spec/ja/glossary.md | 未着手 | |
| docs/spec/en/A-merchant-integration-spec.md | 未着手 | |
| docs/spec/en/B-provider-connection-spec.md | 未着手 | |
| docs/spec/en/glossary.md | 未着手 | |
| docs/spec/ASSUMPTIONS.md | 未着手 | 仮決め・要確認の一覧（A の ※要確認 5 箇所を含める） |
| docs/spec/README.md | 未着手 | |
| docs/spec/pdf/*.pdf | 未着手 | md-to-pdf、日本語フォント |
| 実装との整合再チェック（grep） | 未着手 | |

## 仕様書A（ja）章別

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

## 仕様書B（ja）章別

| 章 | 状態 |
|---|---|
| 1 概要 | 未 |
| 2 決済手段ごとの接続方式 | 未 |
| 3 入金通知・結果通知の受信仕様 | 未 |
| 4 識別子の対応 | 未 |
| 5 消込と過不足処理 | 未 |
| 6 与信・売上・取消・返金・チャージバック | 未 |
| 7 精算と資金の流れ | 未 |
| 8 障害時の運用 | 未 |
| 9 セキュリティ要件 | 未 |
| 10 新規プロバイダを追加する手順 | 未 |
| 11 未実装・今後の予定 | 未 |
| 付録 | 未 |
