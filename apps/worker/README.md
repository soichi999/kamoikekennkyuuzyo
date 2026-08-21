# カケコミ API - Worker

## セットアップ

初回は依存パッケージをインストールします。

```bash
cd apps/worker
npm install
```

## 型チェック

```bash
cd apps/worker
npm run typecheck
```

## ローカル起動

```bash
cd apps/worker
npx wrangler dev
```

デフォルトでは `http://localhost:8787` で起動します。

## デプロイ

```bash
cd apps/worker
npx wrangler deploy
```

## デプロイ手順（当日用）

このプロジェクトはハッカソン特典のCloudflareアカウントを使います。`wrangler login` のブラウザOAuthが通らない場合があるため、環境変数 `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を使う前提の手順です。

1. `export CLOUDFLARE_API_TOKEN=...` と `export CLOUDFLARE_ACCOUNT_ID=...` を設定する
2. `npx wrangler d1 create kakekomi-db` を実行し、出力された `database_id` を `wrangler.toml` の `[[d1_databases]]` セクションに反映する
3. `npx wrangler d1 migrations apply kakekomi-db --remote` でマイグレーションを適用する
4. `npx wrangler kv namespace create kakekomi-pairing` を実行し、出力された `id` を `wrangler.toml` の `[[kv_namespaces]]` セクションに反映する
5. `npx wrangler secret put ADMIN_TOKEN` で管理者トークンを設定する
6. AI機能を使う場合は `[ai]` セクション (`binding = "AI"`) を `wrangler.toml` に追加し、`AI_PROVIDER` を `"workers-ai"` に変更する。または Anthropic API を使う場合は `npx wrangler secret put ANTHROPIC_API_KEY` を実行し `AI_PROVIDER` を `"anthropic"` にする
7. `npx wrangler deploy` でデプロイする

※ `wrangler.toml` の `database_id` と KV の `id` は現在プレースホルダーになっています。上記手順で実際の値に置き換えるまでは `npx wrangler dev`（ローカル実行）のみで開発を進めてください。

## 動作確認 curl コマンド

### 正常系

#### ヘルスチェック
```bash
curl -s http://localhost:8787/ | jq
curl -s http://localhost:8787/v1 | jq
```

#### ペアリング作成
```bash
curl -s -X POST http://localhost:8787/v1/pairing/create | jq
```

#### ペアリング消費
```bash
curl -s -X POST http://localhost:8787/v1/pairing/redeem \
  -H "Content-Type: application/json" \
  -d '{"code":"482915","child_name":"はると"}' | jq
```

#### 子ども一覧
```bash
# family_id は pairing/create した結果を使う
curl -s http://localhost:8787/v1/family/fam_8f2a1c94/children \
  -H "X-Family-Id: fam_8f2a1c94" | jq
```

#### 位置情報送信
```bash
# family_id は pairing/create した結果を使う
curl -s -X POST http://localhost:8787/v1/locations \
  -H "Content-Type: application/json" \
  -H "X-Family-Id: fam_8f2a1c94" \
  -d '{"child_id":"chd_3b7e05d1","points":[{"lat":35.6478,"lng":139.6601,"at":"2026-08-20T15:42:00+09:00"}]}' | jq
```

#### グリッド
```bash
curl -s "http://localhost:8787/v1/grid?bbox=139.65,35.64,139.67,35.65" | jq
```

#### 単発スコア
```bash
curl -s "http://localhost:8787/v1/score?lat=35.6455&lng=139.6566&at=2026-08-20T18:00:00+09:00" | jq
```

#### 日次結果
```bash
# family_id は pairing/create した結果を使う
curl -s "http://localhost:8787/v1/children/chd_3b7e05d1/daily?date=2026-08-20" \
  -H "X-Family-Id: fam_8f2a1c94" | jq
```

#### 日次結果（集計未完了）
```bash
# family_id は pairing/create した結果を使う
curl -s "http://localhost:8787/v1/children/chd_3b7e05d1/daily?date=2026-08-21" \
  -H "X-Family-Id: fam_8f2a1c94" | jq
```

#### 週間グラフ
```bash
# family_id は pairing/create した結果を使う
curl -s "http://localhost:8787/v1/children/chd_3b7e05d1/weekly?end=2026-08-20" \
  -H "X-Family-Id: fam_8f2a1c94" | jq
```

#### 管理者: 日次集計を手動実行

```bash
curl -s -X POST http://localhost:8787/v1/admin/aggregate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"child_id":"chd_3b7e05d1","date":"2026-08-21"}' | jq
```

### 異常系

#### pairng/redeem: code 未指定 → 400
```bash
curl -s -X POST http://localhost:8787/v1/pairing/redeem \
  -H "Content-Type: application/json" \
  -d '{"code":""}' | jq
```

#### pairing/redeem: code 000000 → 404
```bash
curl -s -X POST http://localhost:8787/v1/pairing/redeem \
  -H "Content-Type: application/json" \
  -d '{"code":"000000","child_name":"はると"}' | jq
```

#### locations: child_id 未指定 → 400
```bash
curl -s -X POST http://localhost:8787/v1/locations \
  -H "Content-Type: application/json" \
  -H "X-Family-Id: fam_8f2a1c94" \
  -d '{"points":[]}' | jq
```

#### locations: points 未指定 → 400
```bash
curl -s -X POST http://localhost:8787/v1/locations \
  -H "Content-Type: application/json" \
  -H "X-Family-Id: fam_8f2a1c94" \
  -d '{"child_id":"chd_3b7e05d1"}' | jq
```

#### locations: points 超過 → 400
```bash
curl -s -X POST http://localhost:8787/v1/locations \
  -H "Content-Type: application/json" \
  -H "X-Family-Id: fam_8f2a1c94" \
  -d "{\"child_id\":\"chd_3b7e05d1\",\"points\":$(python3 -c 'import json; print(json.dumps([{"lat":35.6,"lng":139.6,"at":"2026-08-20T15:00:00+09:00"} for _ in range(501)]))')}" | jq
```

#### score: lat/lng 未指定 → 400
```bash
curl -s "http://localhost:8787/v1/score" | jq
```

#### grid: bbox 未指定 → 400
```bash
curl -s "http://localhost:8787/v1/grid" | jq
```

#### grid: bbox 不正 → 400
```bash
curl -s "http://localhost:8787/v1/grid?bbox=a,b,c" | jq
curl -s "http://localhost:8787/v1/grid?bbox=140,35,139,36" | jq
```

#### 存在しないパス → 404
```bash
curl -s http://localhost:8787/v1/nonexistent | jq
```

### OPTIONS プリフライト → 204
```bash
curl -s -o /dev/null -w "%{http_code}" -X OPTIONS http://localhost:8787/v1/pairing/create
```