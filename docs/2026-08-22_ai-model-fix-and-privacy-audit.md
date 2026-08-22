---
担当: tadas
モデル: Claude Opus 5
日時: 2026-08-22 11:40
---

# AI を Workers AI (gemma-4) に固定 / 位置情報プライバシー監査（未対応・記録のみ）

## 1. デプロイ状況の確認

`wrangler whoami` / `d1 list` / `kv namespace list` / `deployments list` で確認した結果、
**Cloudflare には何もデプロイされていない**。

- ログイン: `tadasukeiizuka@gmail.com` / アカウント **tokyo_odh_480** (`215050c2...`) ＝ハッカソン特典アカウント
- Worker `kakekomi-api`: 存在しない（`code: 10007`）
- D1: 0件 / KV: 空
- `wrangler.toml` の `database_id` / KV `id` はプレースホルダ（`0000...`）のまま

デプロイは未実施のまま保留中。

### 追記: D1 / KV を作成（2026-08-22 11:44）

| リソース | 名前 | ID |
| --- | --- | --- |
| D1 | `kakekomi-db` | `fa73f782-d0d2-4830-aebb-19875510b464`（region APAC） |
| KV | `kakekomi-pairing` | `31834c202d834ebdae61320cd87ad47b` |

`wrangler.toml` に ID を反映。バインディング名は wrangler の提案（`kakekomi_db` 等）ではなく
コード側の `DB` / `PAIRING_KV` を維持している。

`wrangler d1 migrations apply kakekomi-db --remote` で `0001_init.sql` を適用済み。
リモートに `family` / `child` / `location` / `daily` の4テーブルを確認。

**まだ `wrangler deploy` は実行していない。** 残りは `wrangler secret put ADMIN_TOKEN` と deploy のみ。

## 2. AI プロバイダの決定（対応済み）

**AI は Cloudflare Workers AI のみを使う。モデルは `@cf/google/gemma-4-26b-a4b-it` に固定。
それ以外（Anthropic API 等の外部 AI）は使わない。**

`wrangler ai models` でアカウント上にモデルが存在することを確認済み（ID `328adb49-4a7d-43e3-a2d5-802ae8100fe7`）。

### 変更内容

| ファイル | 変更 |
| --- | --- |
| `src/ai/workersAi.ts` | `MODEL` を `@cf/qwen/qwen3-30b-a3b-fp8` → `@cf/google/gemma-4-26b-a4b-it` |
| `src/ai/anthropic.ts` | **削除** |
| `src/ai/index.ts` | `anthropic` 分岐を削除。`workers-ai` → 失敗時 `template` フォールバックのみ |
| `src/types.ts` | `ANTHROPIC_API_KEY` を削除、`AI_PROVIDER` を `'workers-ai' \| 'template'` に型で限定 |
| `wrangler.toml` | `[ai]` バインディングを有効化、`AI_PROVIDER = "workers-ai"` |
| `vitest.config.ts` | テスト環境で `AI_PROVIDER='template'` を強制上書き |
| `CLAUDE.md` | 上記に合わせて更新 |

### ハマった点: `[ai]` 有効化でテストがリモート課金を踏む

`[ai]` を有効にした直後、phase6 のテストが2件落ちた。

1. health check が `ai_provider: 'template'` を期待していたが `workers-ai` になった
2. smoke test の `admin aggregate` が**実際にリモートの Workers AI を呼びに行き**、
   10秒タイムアウト > vitest の5秒制限で timeout

phase5 はテスト側でフェイク AI を注入しているので無事だったが、phase6 は `wrangler.toml` の
既定値をそのまま使うため直撃した。`vitest.config.ts` の `miniflare.bindings` で
`AI_PROVIDER='template'` を強制し、テストを密閉して解決。

> **Workers AI バインディングはローカル実行でも常にリモートに繋がる**（wrangler も警告を出す）。
> `wrangler dev` を叩くと本物の推論が走って課金されるので注意。

typecheck / test は 40/40 パス。

## 3. 位置情報プライバシー監査（**未対応・認識共有のみ**）

子どもの位置情報を扱う以上、バックエンド侵害＝ストーカー化という最悪シナリオがある。
現状コードを監査した結果を記録する。**今回は実装せず、認識の共有に留める。**

### 前提

「時空間4点で95%が一意に特定できる」は de Montjoye et al. 2013
(*Unique in the Crowd*, Scientific Reports) の結果。ただし正確には
「データセット内で一意に絞り込める（uniqueness）」であり「95%の確率で氏名が判明する」ではない。

**が、本アプリではその議論以前に**、`child` テーブルが
`home_lat/home_lng`, `school_lat/school_lng` を明示カラムとして持つため、
自宅と通学先が直接読み取れる。

### 検出した問題

| # | 問題 | 場所 | 深刻度 |
| --- | --- | --- | --- |
| 1 | **`X-Family-Id` は認証ではない** — ヘッダの存在チェックのみで秘密情報ゼロ。family_id を知る＝その家族の全位置履歴が読める | `auth.ts:15-20` | 致命的 |
| 2 | **ID 生成が `Math.random()`** — family_id もペアリング6桁コードも。workerd の PRNG は出力から内部状態を復元しうる | `score.ts:78-89` | 致命的 |
| 3 | **redeem にレート制限なし** — 6桁＝10^6。レート制限は `/v1/locations` にしかない。10分TTL内の総当たりが現実的 | `index.ts:198` | 高 |
| 4 | **位置ログの保持期間が無制限** — `DELETE FROM` がコードベースに1箇所も無い（grep 済み）。集計後も生ログが永久に残る | 全体 | 高 |
| 5 | **削除 API が無い** — 子どものデータを消す手段がユーザーに存在しない | API 全体 | 高 |
| 6 | 座標が生値・full 精度で保存 | `locations.ts:16` | 中 |
| 7 | CORS `origin: '*'`（ただし `allowHeaders` に `X-Family-Id` が無くブラウザからは送れず実害は限定的） | `index.ts:155-159` | 低 |
| 8 | ADMIN_TOKEN が非 timing-safe 比較（`!==`） | `index.ts:423` | 低 |

**#1 + #2 の組み合わせが最大のリスク。** ハッキング不要で、正規のペアリング API を
叩いて PRNG 状態を復元すれば外部から他家族の位置履歴を読めうる。

### 対策案（未実施）

**即実装可・他人に影響なし**

- **D**: `Math.random()` → `crypto.getRandomValues()`。family_id を 8文字→22文字（128bit 相当）へ
- **E**: `/v1/pairing/redeem` にレート制限（IP 単位 + コード失敗回数）
- **B**: 保存時に座標を小数第3位（約110m）へ丸める。表示粒度は保ったまま特定リスクを下げる、費用対効果が最も高い一手
- **F**: Cron に `DELETE FROM location WHERE at < date('now','-7 day')`。生ログ7日、集計済み `daily` のみ保持
- **H**: CORS 限定 / timing-safe 比較

**sochan と要相談（API 契約が変わる）**

- **C**: `X-Family-Id` を廃止し、pairing 時に発行する秘密トークン（`Authorization: Bearer`）へ。D1 にはハッシュのみ保存。#1 の本質的修正
- **G**: `DELETE /v1/children/:id` を追加

なお「スコア判定もクライアントサイドで」という案は方向性としては正しいが、
オープンデータ取得をアプリ側に全部背負わせることになり、本戦期間中の作り直しは非現実的。
「サーバーは持つが、持ち方を最小化する」（B/F）ほうが同じ効果を安く得られる。
