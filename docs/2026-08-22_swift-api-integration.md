---
担当: sochan
モデル: Claude Sonnet 5
日時: 2026-08-22 16:35
---

# Swift側にKakekomiAPIクライアントを組み込み

tadasさんが `apps/worker/KakekomiAPI.swift` に用意してくれたAPIクライアント一式を、
`apps/swift/Sources/Frontend/API/KakekomiAPI.swift` としてコピーし、Frontendモジュールに組み込んだ。

## やったこと

- `apps/swift/Package.swift` に `platforms: [.iOS(.v17), .macOS(.v14)]` を追加（CoreLocation利用のため）
- `KakekomiAPI.swift` をコピーし、モジュール外から使えるよう型・プロパティ・メソッドに `public` を付与
  - `Sendable` 準拠も追加（Swift 6の厳格な並行性チェック対応）
  - 元ファイル（`apps/worker/KakekomiAPI.swift`）はtadasさんの担当分なので変更していない
- `Frontend` に `createPairing()` の薄いラッパーを追加
- ローカルで `wrangler dev` + D1マイグレーション適用を行い、`swift run App` から実際に
  `POST /v1/pairing/create` を呼び出して疎通確認（正常にコード発行を確認）

## 次にやること

- CLAUDE.md記載の画面構成（親アプリ: 初回セットアップ / 子ども一覧 / ホーム / マップ、子アプリ: コード入力 / ヒートマップ）をSwiftUIで実装
- ペアリングコード保存（Keychain等）、家族ID管理の実装
- 実機・シミュレータでの動作確認
