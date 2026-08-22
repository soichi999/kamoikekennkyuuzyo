---
担当: sochan
モデル: Claude Sonnet 5
日時: 2026-08-22 17:42
---

# ホーム画面（タブ1）を実装

CLAUDE.mdの画面構成に従い、親アプリのホーム画面を実装した。

## やったこと

- `HomeViewModel`: `GET /v1/children/{id}/weekly` と `GET /v1/children/{id}/daily` を並行取得
- `HomeView`:
  - スコア推移グラフ（Swift Charts、`LineMark`+`PointMark`、危険レベルで色分け、危険ポイントがある日はマーカーを大きく表示）
  - 「今日の危険だったポイント」リスト（最大5件、タップで詳細シート表示）
  - 危険ポイント詳細シート（要因・滞在時間を表示）
  - pull-to-refresh対応
- `RootView`に「親: ホーム」タブを追加

## 動作確認について

tadasさんが `wrangler.toml` に Workers AI の `[ai]` バインディング（remote接続）を有効化したため、
この環境（Cloudflareにログインしていない）では `wrangler dev` が起動できなくなった
（`CLOUDFLARE_API_TOKEN` が必要というエラー）。設定ファイルはtadasさんの担当分のため変更せず、
代わりに `apps/worker/API.md` のレスポンス例に準拠したJSONで `WeeklyResponse` / `DailyResponse` の
デコードをユニットテスト化して検証した（`Tests/FrontendTests/HomeDecodingTests.swift`）。
実サーバーでの疎通確認は、tadasさんの環境かCLOUDFLARE_API_TOKEN共有後に改めて行うのがよい。

## 次にやること

- 親アプリのマップ画面（通学路の安全/注意/危険3段階色分け）
- 子ども一覧画面
- family_id / child_id の永続化
