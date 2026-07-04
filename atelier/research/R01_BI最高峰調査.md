---
summary: オフライン・ブラウザ完結のピボット/BI領域の最高峰調査。結論はPerspective継続+HueyのUNION結合とTadの1パネル設定UXを盗む。
insight: Pivot Bench M1 (Salesforceレポート上位互換)
date: 2026-07-04
---

# R01 オフラインBI/ピボット最高峰調査

## 調査対象の問い

1. 「行キー3〜4個の階層集計×別キーで列分割×複数レポートの並置/結合」を既に満たす既存ツールはあるか
2. Pivot Bench の土台(FINOS Perspective)は今も最良の選択か
3. 盗むべきUX・機能はどこにあるか

## 候補一覧

| 名前 | 種別 | エンジン | ライセンス | 一言評価 |
|---|---|---|---|---|
| FINOS Perspective | 組込コンポーネント | 独自WASM | Apache-2.0 | 大規模データの速度・datagridは頭一つ抜けている。現土台 |
| Huey (rpbouman/huey) | 静的Webアプリ | DuckDB-WASM | MIT | file://で動く。**類似ファイル自動UNION**が天才的 |
| Tad (antonycourtney/tad) | デスクトップ | DuckDB | MIT | **1パネルでピボット設定が完結**するUXの教科書 |
| Graphic Walker (Kanaries) | 組込コンポーネント | 独自/wasm | Apache-2.0 | Tableau風ドラッグ&ドロップ。チャートが欲しくなったら(M4以降) |
| WebPivotTable / WebDataRocks / Flexmonster | 商用コンポーネント | 独自 | 商用 | 商用の磨き込み参考。採用はしない |
| Excel + XL-Connector / Coefficient | 現職の主流 | Excel | 商用 | 「今のやり方」。ここからの脱出が本プロジェクト |

## 各候補の詳細

### FINOS Perspective — github.com/finos/perspective

- 何が最高峰か: ストリーミング/大規模データでの描画速度、`group_by`/`split_by`/`aggregates` を備えた datagrid、WASM完結
- 盗むべき: すでに土台として採用済み。`split_by`(列分割)がM1の核
- 自分のmustとの適合: 正規化・バケットマスタ・複数レポート結合は**無い**(=作る差分)

### Huey — github.com/rpbouman/huey

- 何が最高峰か: DuckDB-WASMでfile://完結、PWAオフライン。**カラム構成が類似するファイルを自動グループ化してUNION分析**できる
- 盗むべき: ①複数レポートのUNION結合(列和集合+出所列) ②結果とクエリのクリップボード/ファイル書き出し(M2へ)
- 捨てる: SQL露出、属性ツリーの重厚なUI(自分はキー3〜4個を選ぶだけでいい)

### Tad — github.com/antonycourtney/tad

- 何が最高峰か: ピボット・フィルタ・集計・列順を**1つの設定パネルで完結**させる操作性。CSVを開いて数秒で階層ピボットに到達
- 盗むべき: 「設定ドロワーを開かず、その場で行キーと集計を選ぶ」プリセットバーの思想
- 捨てる: デスクトップアプリ形態(単一HTML原則に反する)

## 結論

- **そのまま使える既存ツールは無い**: Huey/Tadは近いが、日本語Salesforceレポートの正規化(全角/△/¥/Shift_JIS)+バケットマスタ3階層派生+3面比較を併せ持つものは存在しない → 差分を作る判断は正しい
- **ベース**: 既存 Pivot Bench(Perspective)を継続。DuckDB-WASMへの乗換は、SQLが必要になるM4以降に再検討(乗換先はHuey構造を参照)
- **盗む機能リスト**: Hueyから「複数ファイルUNION+出所列」/ Tadから「1パネル・プリセットバーUX」/ Hueyから「結果書き出し」(M2)

## 出典

- https://github.com/rpbouman/huey
- https://github.com/antonycourtney/tad
- https://github.com/Kanaries/graphic-walker
- https://perspective.finos.org / https://github.com/finos/perspective/discussions/1664
- https://medium.com/@seantiav98.dev/duckdb-vs-finos-perspective-a-comparison-for-web-developers-1d40f20eb26f
- https://webpivottable.com / https://www.xappex.com/blog/export-salesforce-reports-to-excel/
