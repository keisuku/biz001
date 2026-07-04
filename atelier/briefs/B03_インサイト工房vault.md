---
summary: インサイト工房(Obsidian vault)構築の指示書。フォルダ構成・テンプレ配線・CLAUDE.md・frontmatter規約。整形級〜量産級向け。
project: P2
assignee: 整形級
status: 未着手
---

# B03 インサイト工房 vault 構築

> 実行環境: ユーザーのPC上の新規フォルダ(例: `~/atelier-vault/`)。Obsidianで開ける
> プレーンMarkdownのみで構成する。プラグインが無くても壊れない構造にすること。

## 背景

テーラーメイド手順([01_PIPELINE](../01_PIPELINE.md))を回す運用場。全ての欲望・調査・指示書をMarkdownで一元管理し、AI(Claude Code / Codex)がフォルダごと読み書きできるようにする(憲法第5条: ローカルMarkdown vaultはLLMの最良の外部メモリ)。

## 参照最高峰(調査済みの定石)

- Zettelkasten 3層 + PARA の折衷フォルダ構成(2026年の定番。Inbox→加工→恒久資産の流れ)
- frontmatter `summary:` を全ノートに付与 → AI検索精度とトークン効率が大幅改善(vault千ノート規模で30〜50%削減の報告)
- Claude Code から vault を直接開く運用(Obsidian MCP / Claudian プラグインは任意。まずはファイル直読みで十分)

## 仕様

1. フォルダ構成を作る:
```
atelier-vault/
  00_Inbox/          兆しメモの投入口(整理不要ゾーン)
  10_Insights/       インサイトファイル(templates/insight.md 形式)
  20_Research/       最高峰調査(templates/research.md 形式)
  30_Briefs/         指示書(templates/brief.md 形式)
  40_Assets/         ドメイン資産(マスタJSON・列名辞書・正規化ルール)
  50_MOC/            ハブノート(領域別の目次: 仕事/知的生産/私生活)
  90_Archive/        完了・見送り
  templates/         biz001リポジトリの atelier/templates/ を複製
  CLAUDE.md          下記
```
2. `CLAUDE.md` を書く。内容: このvaultの目的(1段落)、憲法5原則の要約、フォルダの意味、AIへの指示(「新規ノートは必ずfrontmatterにsummary/status/dateを付与」「Inboxのメモを見つけたらinsight形式への昇格を提案」)
3. biz001 の `atelier/00_DOCTRINE.md` `01_PIPELINE.md` を vault ルートへ複製(vault単独でも手順が完結するように)
4. Obsidian推奨プラグインを `SETUP.md` に列挙(必須ではない): Dataview(status別一覧)、Templater、QuickAdd(Inbox即投入)、obsidian-git(履歴)。各1行の用途説明付き
5. Dataviewが入った場合用に、`50_MOC/工程ボード.md` へ status 別クエリ(兆し/調査中/指示書化/完了)を書いておく(Dataview無しでは単なるコード表示になるが壊れない)

## やらないこと

- プラグイン自作、MCPサーバ構築(必要になったらR03の調査結果を見て別briefで)
- biz001 リポジトリ内 atelier/ との自動同期(手動コピーで十分。二重管理を恐れない)

## 検収基準

- [ ] フォルダと全ファイルが仕様どおり存在(ツリー出力添付)
- [ ] Obsidianで開いてリンク切れゼロ(グラフビューのスクリーンショット添付)
- [ ] CLAUDE.md を読んだ別セッションのAIが「兆しメモ→insight昇格」を正しく実行できる(実演ログ添付)
