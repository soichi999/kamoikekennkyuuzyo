---
担当: sochan
モデル: Claude Sonnet 5
日時: 2026-08-22 17:16
---

# 核となる画面（ペアリング・ヒートマップ）を実装

サービスの核である「危険度の可視化」フローの最短経路を実装した。

## やったこと

- `ParentPairingViewModel` / `ParentPairingView`: 親アプリの初回セットアップ画面。「コードを発行」→6桁コード表示
- `ChildPairingViewModel` / `ChildPairingView`: 子アプリのコード入力画面。6桁コード送信→ペアリング完了
- `HeatmapViewModel` / `HeatmapView`: 子アプリのヒートマップ画面。`GET /v1/grid` を叩き、MapKit上にsafe/caution/dangerを緑/黄/赤の円で表示
- `App`ターゲットを`main.swift`のトップレベル実行から`@main struct KamoikeApp: App`（SwiftUI）に変更し、`RootView`で3画面をPickerで切り替えられるデモ構成にした
- ローカルworker（`wrangler dev`）に対して`swift run App`でビルド・起動し、クラッシュしないことを確認（GUIスクリーンショットは実行環境の権限上取得不可だったため、プロセス生存確認とテストで代替）

## 次にやること

- ホーム画面（スコア推移グラフ、今日の危険ポイントリスト）
- マップ画面（親アプリ側、通学路の安全/注意/危険3段階色分け）
- 子ども一覧画面
- 位置情報の実送信（CoreLocationからの取得→`POST /v1/locations`）
- family_id / child_id の永続化（現状は画面をまたぐと消える）
