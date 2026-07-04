---
summary: Pivot Bench M2 磨き込みの指示書。マスタ編集UI・保存プリセット集・結果書き出し・ルール別ヒット統計。量産級(Codex/Sonnet)向け。
project: P1
assignee: 量産級
status: 未着手
---

# B01 Pivot Bench M2 — 磨き込み

> この指示書は自己完結している。リポジトリ keisuku/biz001 を読める環境で実行すること。
> 着手前に `atelier/00_DOCTRINE.md` と `docs/SPEC.md` を読むこと。M1がマージ済みであることを確認してから着手。

## 背景

Pivot Bench はSalesforceレポートをオフラインで正規化・分類・3面ピボット比較する自分専用単一HTMLツール。M1でプリセットバーと複数レポート結合まで完成。M2は日常運用の摩擦を消す磨き込み: マスタをJSON手編集せずに画面で直せること、よく使う分析を1クリックで呼べること、結果を他所へ持ち出せること。

## 前提・制約

- ユーザーは一人。オフライン単一成果物(実行時ネットワーク0件・localStorage不使用は自動テストで担保済み。壊さないこと)
- 既存のダークテーマ(`src/styles.css` の `:root` トークン)のトーンを維持。格好良さは検収対象
- ビルド: `npm install && npm run build` → `dist/pivot-bench.html`。検証: `npm run generate:testdata` + Playwright(過去の検証スクリプトの構造は git 履歴のコミットメッセージ参照)

## 参照する既存資産

- `src/app.js` — `defaultMaster` / `applyMaster()` / `download()` / ビュー設定JSON入出力が既にある。再利用する
- `docs/SPEC.md` — バケットマスタのJSON構造とfirst-match-wins評価
- 参照最高峰: Huey (github.com/rpbouman/huey) の「結果とクエリの書き出し」。`atelier/research/R01_BI最高峰調査.md` 参照

## 仕様

1. **マスタ編集モーダル**: 現在のマスタをテーブル表示(ルール行: type/値/assign×3、ドラッグまたは↑↓ボタンで順序変更、行追加/削除)。meta.name/updated も編集可。「適用」で即再集計、「JSONへ書き出し」は既存 `download()` を使う
2. **ルール別ヒット統計**: 編集モーダル内で、直近の適用結果におけるルール毎のヒット件数と未分類件数を表示(`applyMaster` は元々 hits 配列を計算していた。M0の実装履歴参照)
3. **保存プリセット集**: 名前付きプリセット(行キー・列分割・値列・集計の組)を複数保持し、ヘッダーのドロップダウンから1クリック適用。永続化はビュー設定JSON v2 に `presets` 配列として含める(localStorage禁止)
4. **結果書き出し**: アクティブなペインの現在ビュー(集計後)をCSVでダウンロード+クリップボードコピー(タブ区切り、Excel貼付用)。Perspectiveの `view.to_csv()` を使う
5. ボタン増加に伴いヘッダーが窮屈になったら、マスタ関連を1つのメニュー(ドロップダウン)に集約してよい

## やらないこと

- チャート/グラフ(M4以降)、DuckDBへの乗換、複数マスタの同時適用、i18n、localStorage

## 検収基準(全て証跡必須)

- [ ] マスタ編集→適用→未分類件数が変化するPlaywrightテスト
- [ ] プリセット保存→JSON書き出し→再読込→1クリック適用の往復テスト
- [ ] CSV書き出しの内容が画面の集計値と一致
- [ ] 既存テスト全パス+実行時ネットワーク0件維持(出力添付)
- [ ] 50,000行データでのスクリーンショット添付
- [ ] `docs/SPEC.md` 更新、`atelier/02_MASTERPLAN.md` 台帳更新
