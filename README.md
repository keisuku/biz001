# Pivot Bench

日本の法人保険代理店向けに、SalesforceレポートCSV/xlsxをオフラインで正規化し、FINOS Perspectiveで高速ピボット表示する単一HTMLツールです。仕様の詳細は [docs/SPEC.md](docs/SPEC.md) を参照してください。

## ビルド

```bash
npm install
npm run build
```

成果物は `dist/pivot-bench.html`(単一ファイル、約7.4MB)です。実行時はCDN/fetch/外部フォント/localStorageを使いません。Perspective、Perspective Viewer、Datagrid、SheetJSはビルド時にbundleへ埋め込まれます(WASM同梱のinline版を使用)。`file://` で直接開けます。

## 使い方

1. `dist/pivot-bench.html` をブラウザで開く。
2. CSV/xlsx(最大3本)を「開く」ボタン・Cmd/Ctrl+O・ドラッグ&ドロップのいずれかで読込(CSVはUTF-8/Shift_JIS自動判定)。
3. ヘッダーの「標準マスタ」または「マスタを開く」(JSON)で商材3階層分類を付与。未分類件数はゲージに表示。
4. **プリセットバー**で行キー最大4個×列分割1個×値2個(集計)を選ぶだけで3面に即適用。「全面」オフでアクティブペインのみ。
5. 複数レポートは**並置**(面ごとに割当)と**結合**(「レポート」列付き1テーブル化→レポート横並び比較)を切替。
6. ショートカット: Cmd/Ctrl+O 開く / Cmd/Ctrl+Enter 適用 / 1・2・3 ペイン切替。

### JSON入出力(永続化)

- **マスタ書き出し / マスタを開く** — バケットマスタJSONの保存・読込(構造は docs/SPEC.md 参照)
- **ビュー書き出し / ビュー読込** — 3面分のビュー設定JSONの保存・復元

## テストデータ

```bash
npm run generate:testdata
```

`testdata/pivot-bench-50000.xlsx` に50列×50,000行の検証用xlsxを生成します。標準マスタ適用時の未分類件数は2,942件になります。

## 設計コメント

- ピボットエンジンは自作せず `@finos/perspective` と `@finos/perspective-viewer-datagrid` を使用します。
- バケットマスタはJSON資産として扱い、候補列名を先頭から照合し、ルールを上から順に評価して最初の一致で確定します。
- `localStorage` は使わず、マスタ・ビュー設定はJSON入出力で永続化します。
- 読込データから1つのPerspectiveテーブルを作り、3面のビューアで共有します。
