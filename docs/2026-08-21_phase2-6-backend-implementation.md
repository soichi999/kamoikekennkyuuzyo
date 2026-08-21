---
担当: tadas
モデル: Claude Sonnet 5（一部 opencode/openrouter/deepseek-v4-flash に実装委譲）
日時: 2026-08-21 12:35
---

# Phase 2〜6 バックエンド本実装

`apps/worker` を Phase 1（モックAPI）から Phase 2〜6（D1/KV/Cron/AI を使った本実装）へ引き上げた。1フェーズずつ「実装→テスト作成→実行→報告」のループで進行し、各フェーズのテストが全通過してから次に進んだ。

## Phase 2: 永続化の土台

- `migrations/0001_init.sql`: family / child / location / daily テーブル
- `src/scoring/`: `index.ts`（`SCORING_IMPL` 環境変数でmock/realを切替）/ `mock.ts`（既存score.tsをラップ）/ `real.ts`（当日実装用の空スタブ）
- `src/pairing.ts`: KVでのペアリングコード発行（TTL 600秒・使い捨て）、D1へのfamily/child登録
- `src/auth.ts`: `X-Family-Id` ミドルウェア（401/403）
- テスト基盤: vitest + `@cloudflare/vitest-pool-workers`（ローカルMiniflare上で実際にD1/KVを使い、本物のfetchでエンドポイントを叩く）
- テスト7件通過

## Phase 3: 位置の受信と保存

- `/v1/locations` を `scoring/index.ts` 経由 + D1保存（UPSERT）に変更
- `/v1/grid`, `/v1/score` も scoring モジュール経由に置換
- レスポンス形状がPhase1と同一であることをテストで検証
- テスト4件通過（累計11件）

## Phase 4: 集計エンジン

- `src/aggregation/`: ホットスポット抽出（5分以内・200m以内でクラスタ化、上位5件）、`total_score`算出（滞在時間加重平均+ホットスポット数ペナルティ）、baseline算出（過去14日中同曜日含む集計の中央値、7日未満はnull）、統計算出
- 純粋関数部分（hotspots/totalScore/baseline/stats）は opencode(deepseek-v4-flash) に実装委譲し、自分でtypecheck・既知の軌跡での手計算検証を実施。null安全性のTSエラー1件を自分で修正
- `aggregateDaily(env, childId, date)` を実装、D1連携部分は自分で実装
- テスト20件通過（累計31件）

## Phase 5: Cron + AI

- `wrangler.toml` に `crons = ["0 13 * * *"]`（22:00 JST）
- `POST /v1/admin/aggregate`（`ADMIN_TOKEN` で保護、手動実行・デモ用）
- `src/ai/`: `AI_PROVIDER`（workers-ai/anthropic/template）切替、不正JSON時のフォールバック、例外時もstatus:readyを維持
- **重要**: `[ai]` バインディングをwrangler.tomlに追加してテストしたところ、Miniflareがこのマシンにキャッシュされていた別のCloudflareアカウントへ実際にAPIリクエストを送信してしまった。課金の恐れがあるため即座に `[ai]` バインディングをコメントアウトし、`AI_PROVIDER` の既定値を `template` に固定。当日、ハッカソン特典アカウントの認証情報が用意できてから有効化すること
- テスト8件通過（累計39件、後にPhase6で+1）

## Phase 6: 仕上げ

- エラーレスポンス形式 `{error:{code,message}}` の統一を確認
- `POST /v1/locations` にKVベースのレート制限（同一child_idで1分60回、超過は429 `RATE_LIMITED`）
- `GET /` に `scoring_impl` / `ai_provider` を追加
- `API.md` / `KakekomiAPI.swift` / `README.md` を更新（opencodeに委譲、自分で差分レビューし軽微な修正2件を実施）
- スモークテスト1本（ペアリング→children→locations→grid/score→admin aggregate→daily→weekly の一気通貫）
- 最終テスト40件全通過

## 変更していないこと

- 全レスポンスのJSONキー名・型・ネスト構造（追加のみ、削除・リネームなし）
- `score`/`level` の定義
- 全エンドポイントのURLパス
- `apps/swift/` には一切触れていない

## 未実施（当日ハッカソン本番で行うこと）

- `src/scoring/real.ts` の実装（オープンデータ連携）
- 実際の `wrangler d1 create` / `kv namespace create` / `wrangler deploy`（今回は意図的に未実行）
- `[ai]` バインディングの有効化（ハッカソン特典アカウントの認証情報が必要）
