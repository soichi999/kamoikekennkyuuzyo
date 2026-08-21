---
担当: tadas
モデル: Claude Sonnet 5 / DEEPSEEK V4 FLASH
日時: 2026-08-21 10:46
---

# Swiftプロジェクトをモノレポ構成に移行

## やったこと

- Swiftプロジェクト全体を `apps/swift/` に移動
  - `Package.swift`, `Sources/`, `Tests/` → `apps/swift/`
  - Swift専用 `.gitignore` を `apps/swift/.gitignore` に新規作成
- ルート `.gitignore` を共通パターンのみに整理
- `.vscode/launch.json` の `cwd` を `apps/swift` に更新
- `swift build` / `swift test` の動作確認済み

## 背景

バックエンド（Hono / Cloudflare Workers）とフロントエンド（Swift）を1リポジトリで管理するためのモノレポ構成に変更。ルートに他の言語のプロジェクトや設定ファイルが追加できるようになった。
