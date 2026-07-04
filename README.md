# Pivot Bench

日本の法人保険代理店向けに、SalesforceレポートCSV/xlsxをオフラインで正規化し、FINOS Perspectiveで高速ピボット表示する単一HTMLツールです。

## ビルド

```bash
npm install
npm run build
```

成果物は `dist/pivot-bench.html` です。実行時はCDN/fetch/外部フォント/localStorageを使いません。Perspective、Perspective Viewer、Datagrid、SheetJSはビルド時にbundleへ埋め込まれます。

## テストデータ

```bash
npm run generate:testdata
```

`testdata/pivot-bench-50000.xlsx` に50列×50,000行の検証用xlsxを生成します。

## 設計コメント

- ピボットエンジンは自作せず `@finos/perspective` と `@finos/perspective-viewer-datagrid` を使用します。
- バケットマスタはJSON資産として扱い、候補列名を先頭から照合し、ルールを上から順に評価して最初の一致で確定します。
- `localStorage` は使わず、マスタ・ビュー設定はJSON入出力で永続化する前提です。
