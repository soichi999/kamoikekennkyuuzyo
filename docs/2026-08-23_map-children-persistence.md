---
担当: sochan
モデル: Claude Sonnet 5
日時: 2026-08-23 00:34
---

# 親アプリのマップ画面・子ども一覧画面・家族/子ID永続化を実装

CLAUDE.mdの画面構成に残っていた親アプリ側の画面を実装した。

## やったこと

- `AppSession`（`@Observable`）: family_id / selectedChildId を`UserDefaults`に永続化し、アプリ全体で共有する状態として`RootView`から`.environment(session)`で注入
- `ChildrenViewModel` / `ChildrenListView`: 子ども一覧画面。タップで`AppSession.selectChild`を呼び選択状態を保存
- `ParentMapViewModel` / `ParentMapView`: マップ画面（タブ2）。選択中の子の自宅・学校を含むbboxでグリッドスコアを取得し、safe/caution/dangerを緑/黄/赤で色分け表示。自宅・学校はMarkerで表示
- `ParentPairingView`: ペアリング成功時に`AppSession.setFamilyId`を呼ぶよう変更
- `RootView`: 未ペアリング時は各画面の代わりにプレースホルダーを表示するようにし、実際の利用フロー（コード発行→子アプリで入力→子ども一覧→ホーム/マップ）をデモできるようにした
- テスト: `AppSessionTests`で永続化（保存・再読み込み・signOut）を検証。既存分と合わせて計5テスト通過

## 次にやること

- 子アプリの位置情報送信（CoreLocationから取得→`POST /v1/locations`、バックグラウンド送信）
- ピン長押しの地点詳細画面（`GET /v1/score`）
- エラー時のリトライ・オフライン対応の作り込み
- 実機（iOSシミュレータ）での見た目確認
