---
summary: GA4データから一人で回す月報基盤の世界調査(Deep Research実施)。最有力はBigQuery→Parquet→DuckDB+Quarto。当アトリエは第1段を単一HTML(GA4 Bench)、第2段をParquet対応と決定。
insight: GA4月報ツール (やること/7 → やること/9)
date: 2026-07-05
---

# GA4分析ツールの最高峰調べ

> 調査はChatGPT Deep Researchで実施(やること/7)。**原文の引用リンクは貼り付け時に失われた**ため、末尾の出典欄は言及プロジェクトの正規URLをこちらで再構成したもの。
> 末尾に【アトリエとしての採否】を追記済み — 調査の推奨(DuckDB+Quarto)をそのまま採用せず、憲法(単一HTML・ガジェット感)と統合して二段構えとした。

## 調査の結論(原文の要旨)

**最有力**: GA4とSearch Console(GSC)をBigQueryに公式エクスポートで逃がし、月次でParquetに書き出して、ローカルのDuckDB + Quartoでレポートを自動生成する構成。

理由:
- **GA4画面エクスポートの限界**: 行数制約と「(other)」行(行数上限超過時に低頻度値がまとめられる)、探索データの保持期間(標準2/14ヶ月)、GSC連携の次元制約(Landing page/Device/Countryのみ、時系列チャート非対応、データ16ヶ月まで)
- クエリ単位のGA4×GSC突き合わせはBigQueryでやるのが公式含め定石
- BigQuery無料枠で現実的(sandbox: 10GB/月1TBクエリ。ただし60日でテーブル失効するため長期は課金推奨。GA4 Export自体は無料、Standardは日次100万イベント上限)
- DuckDBはParquetを直接高速に読め、Quartoは単一HTML/PDFを再現可能に出力(parameterized reports)

**搬出経路の優先順**: ①GA4 BigQuery Export + GSC bulk export → BigQueryで薄い中間テーブル → 月次Parquet ②BigQueryからCSV ③(最後の保険)GA4 UIのCSV+GSCエクスポートの手作業結合

## 候補の評価(原文の要旨)

| 候補 | 何が最高峰か | 盗む | 捨てる | ライセンス |
|---|---|---|---|---|
| **DuckDB + Quarto** | ローカル完結・再現性・単一HTML/PDF出力・parameterized reports | 月報テンプレを引数(月・チャネル・LP群)で回す型 | ノートブックをそのまま読ませる文化 | MIT/OSS |
| **Evidence** | BI as code、静的配信、DuckDB-WASM内蔵のUniversal SQL | 章立て(月次サマリー/チャネル/LP/SEO/異常/補遺)= 読み物として破綻しないレポート構成 | 公開前提の設計(データがクライアント側に渡る) | MIT |
| **DuckDB-WASM自作** | バックエンドなしのブラウザ内SQL(backendless BI) | ローカルParquetを読む軽量閲覧UI(第2段向き) | 最初からフルBIを作ること | MIT |
| **Looker Studio** | 無料でGA4/GSC公式コネクタ、Googleの併用テンプレ | GA4×GSC横並び比較の考え方、KPI画面設計 | Data API直結のまま育てる((other)行・クォータ・接続切れ) | 無料 |
| **Bigquery-GA4-Queries** (aliasoblomov) | GA4 BigQuery向けSQL 65本超(flatten/attribution/engagement/exit) | 月報用に5〜10本へ絞って中間テーブル化 | query packの本番直結 | 独自許諾(企業利用は法務確認) |
| **Backfill-GA4-to-BigQuery** (aliasoblomov) | 後付けBigQuery導入時の歴史欠損の穴埋め | 開始/終了日・重複排除・partitioningの設計 | 定常基盤の中心に置くこと(救済ツール) | ライセンス表記なし・要確認 |
| **GA4-Hourly** (DataMa) | BigQuery SQL一枚の異常検知の最小実装 | 「前数日基準の比較+説明次元を一緒に持つ」異常検知の型(rolling z-scoreで足りる) | SaaS依存の説明フロー | MIT |
| **ga_four_block** (Looker公式) | GA4生イベントを会議で使う粒度へ再構成する設計思想(sessionization、Overview/Behavior/Acquisition/Conversionsの章立て) | 章立てとsession table先行の考え方 | Looker Blockそのままの採用(Looker前提) | MIT(参照設計として読む) |

## KPI設計の定石(原文の要旨)

BtoBはPVでなく**売上から逆算した歩留まりレポート**にする: 売上→受注→商談→MQL→リードの逆算。層は4つ:
- **流入層**: チャネル別 sessions / engaged sessions / new users
- **LP層**: LP別 sessions / engaged率 / CTAクリック率 / フォーム開始率 / 問い合わせ完了率
- **SEO層**: クエリ別 impressions / clicks / CTR / 掲載順位 × 対応LPのセッション・リード率
- **変化層**: 前期比・同月内トレンド・異常一覧

## 【アトリエとしての採否】(2026-07-05 追記)

- **第1段 = 「GA4 Bench」単一HTML**(→ [../やること/9_Codexに渡す_GA4月報ツールを作る.md](../やること/9_Codexに渡す_GA4月報ツールを作る.md)): 入力はGA4/GSCのUIエクスポートCSV。調査が「最後の保険」と呼ぶ経路から始めるのは意図的 — 会社の計測体制(BigQuery有無)が診断の「持ち主に頼むことリスト」でまだ未確認であり、今日動くものを先に持つため。**Python/Quartoは日常運用に持ち込まない**(憲法第6条: 単一成果物・環境構築ゼロ)。Quartoからは「章立て+パラメータ化月報」の思想だけ盗む
- **第2段**(BigQuery導入後・別お願い書): GA4 BigQuery Export + GSC bulk export → 月次Parquet → GA4 BenchにDuckDB-WASM読込を追加。調査の最有力経路に合流する
- 異常検知はGA4-Hourlyの考え方をrolling z-scoreで内蔵。章立てはga_four_block+Evidence+KPI4層を統合

## 出典(正規URLを再構成)

- https://github.com/quarto-dev/quarto-cli / https://quarto.org
- https://github.com/evidence-dev/evidence
- https://github.com/duckdb/duckdb-wasm / https://duckdb.org
- https://github.com/aliasoblomov/Bigquery-GA4-Queries
- https://github.com/aliasoblomov/Backfill-GA4-to-BigQuery
- https://github.com/DataMa-Solutions/GA4-Hourly
- https://github.com/looker-open-source/ga_four_block
- GA4 BigQuery Export: https://support.google.com/analytics/answer/9358801
- Search Console bulk export: https://support.google.com/webmasters/answer/12918484
- GA4のSearch Console連携: https://support.google.com/analytics/answer/10737381
- Looker Studio: https://lookerstudio.google.com / GOV.UK運用知見: https://docs.data-community.publishing.service.gov.uk
