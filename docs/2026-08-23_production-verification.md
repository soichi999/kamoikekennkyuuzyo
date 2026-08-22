---
担当: sochan
モデル: Claude Sonnet 5
日時: 2026-08-23 05:35
---

# 本番サーバー（tadasさんのデプロイ先）との疎通確認

`docs/2026-08-22_security-D-E-and-deploy.md` に記載されていたデプロイ先
**https://kakekomi-api.tokyo-odh-480.workers.dev** に対して、Swiftの`KakekomiAPI`クライアントから
実際に全エンドポイントを叩いて確認した。

## やったこと

- `APIConfig`（環境変数`KAMOIKE_API_BASE_URL`でベースURLを切り替え可能）を追加し、
  全ViewModel/Viewのデフォルト値をこれに統一（今後ローカル/本番の切り替えが容易に）
- 本番URLに対し、`KakekomiAPI.swift`を直接コンパイルした検証スクリプトで一連のAPIを実行し、
  Swift側のデコード・APIクライアントが本番環境で問題なく動くことを確認:
  - `GET /v1` ヘルスチェック（`ai_provider=workers-ai`、Workers AI remoteが有効な状態）
  - `POST /v1/pairing/create` → `POST /v1/pairing/redeem`
  - `GET /v1/family/{id}/children`
  - `POST /v1/locations`（スコア反映まで確認）
  - `GET /v1/score`
  - `GET /v1/grid`
  - 全て成功

## 次にやること

- 実iOSシミュレータでの見た目確認
- 位置情報のバックグラウンド自動送信
