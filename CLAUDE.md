# CLAUDE.md

都知事杯オープンデータ・ハッカソン2026「鴨池研究所」の開発方針。
プロジェクトの状況に応じて、これは更新し続けること。

## プロジェクト概要

- **イベント**: 都知事杯オープンデータ・ハッカソン2026
- **チーム名**: 鴨池研究所
- **狙う賞**: ライジングジェネレーション賞（学生チーム対象）
- **本戦**: 2026年8月22日（土）〜8月23日（日）

### サービスの方向性

「子どもが『助けて』と駆け込める場所の密度」を可視化するアプリ。
子供が危険な道を通った時に、親が把握・教えられるようにするのが目的。

**アーキテクチャ**:
緯度経度入力 → 複合スコアAPI（バックエンド） → Swiftアプリで地図表示（フロントエンド）

## 担当

| 担当           | 名前   | 役割                                     |
| -------------- | ------ | ---------------------------------------- |
| フロントエンド | sochan | Swift（iOSアプリ、地図表示）             |
| バックエンド   | tadas  | API開発（Hono / Cloudflare Workers想定） |

## 画面構成（フロントエンド）

ログイン画面（ID/PASS入力）は無し。ペアリングコード方式のみ。

**親アプリ**

1. 初回セットアップ画面: 「コードを発行」ボタン → 6桁コードを表示
2. 子ども一覧画面: 複数の子がいる場合の切り替え用（1人だけなら省略してホームへ直行でもOK）
3. **ホーム画面**（タブ1）
   - 子のスコア推移グラフ（期間は左右スワイプで切替、`GET /v1/children/{id}/weekly` 相当）
   - 「今日の危険だったポイント」リスト（`daily` のホットスポット、最大5件、タップで詳細）
4. **マップ画面**（タブ2）
   - 通学路を安全（緑）/ 注意（黄）/ 危険（赤）の3段階で色分け表示（`level` を色分けの基準にする、scoreの数値そのままでは色を変えない）
   - 現在地・学校などの地点マーカー表示

タブ1・タブ2は明確に分離する（スクロールで繋げず、別画面として扱う）。

**子アプリ**

1. コード入力画面（初回のみ）: 6桁コードを入力 → 送信でペアリング完了
2. ヒートマップ画面: 自分の周りの危険度だけ見れればOK、シンプルな1画面

## プロジェクト構造

```
kamoikekennkyuuzyo/
├── apps/
│   └── worker/              # Cloudflare Workers バックエンド (Hono + TypeScript)
│       ├── src/
│       │   ├── index.ts     # Hono ルーター（全エンドポイント定義）
│       │   ├── types.ts     # Worker Env / Variables 型定義
│       │   ├── auth.ts      # X-Family-Id 認証ミドルウェア
│       │   ├── pairing.ts   # ペアリングコード発行・交換 (KV + D1)
│       │   ├── locations.ts # 位置情報永続化 (D1 UPSERT)
│       │   ├── score.ts     # スコア計算ユーティリティ (mock用)
│       │   ├── geo.ts       # 測地線距離 (Haversine)
│       │   ├── rateLimit.ts # KV レート制限 (1分60回)
│       │   ├── scoring/
│       │   │   ├── index.ts # スコアリングI/F + SCORING_IMPL 切替
│       │   │   ├── mock.ts  # モックスコアリング実装
│       │   │   └── real.ts  # 本番用スタブ (未実装)
│       │   ├── ai/
│       │   │   ├── index.ts # AI要約I/F + AI_PROVIDER 切替 + フォールバック
│       │   │   ├── types.ts # AiSummary / AiGenerateInput
│       │   │   ├── prompt.ts# AI用プロンプト構築
│       │   │   ├── template.ts # テンプレート固定要約 (フォールバック)
│       │   │   ├── workersAi.ts # Workers AI (Qwen) 呼び出し
│       │   │   ├── anthropic.ts # Anthropic API 呼び出し (claude-haiku)
│       │   │   └── parse.ts # AI応答JSONパース (```json 対応)
│       │   └── aggregation/
│       │       ├── types.ts # ScoredPoint / Hotspot / DailyStats
│       │       ├── daily.ts # aggreatgeDaily() 集計メイン
│       │       ├── runDaily.ts # aggregateDailyWithSummary() + Cron実行
│       │       ├── totalScore.ts # 加重平均スコア + ペナルティ
│       │       ├── hotspots.ts # 危険ポイント抽出・クラスタリング
│       │       ├── baseline.ts # 中央値ベースライン (7日以上)
│       │       ├── stats.ts # 距離・時間・件数統計
│       │       └── repository.ts # D1 クエリ集約
│       ├── migrations/
│       │   └── 0001_init.sql # スキーマ定義
│       ├── test/             # Vitest テスト (phase別)
│       ├── wrangler.toml     # Workers設定
│       └── package.json
├── docs/                    # 作業記録
└── CLAUDE.md                # 本ファイル
```

## 設計の詳細

### 1. API エンドポイント一覧（全 9 エンドポイント）

| Method | Path | Auth | 説明 |
|--------|------|------|------|
| GET | `/` | なし | ヘルスチェック（scoring_impl, ai_provider を返す） |
| GET | `/v1` | なし | 同上 |
| POST | `/v1/pairing/create` | なし | ペアリングコード発行（6桁数字、KV 10分TTL・使い捨て） |
| POST | `/v1/pairing/redeem` | なし | コード交換（削除してからD1にchild登録） |
| GET | `/v1/family/:family_id/children` | X-Family-Id | 家族に紐づく子一覧 |
| POST | `/v1/locations` | X-Family-Id | 位置情報送信（最大500件、D1 UPSERT） |
| GET | `/v1/score?lat=&lng=&at=` | なし | 1地点のスコア |
| GET | `/v1/grid?bbox=&zoom=&at=` | なし | 範囲内グリッドスコア |
| GET | `/v1/children/:child_id/daily?date=` | X-Family-Id | 日次集計（pending/no_data/ready） |
| GET | `/v1/children/:child_id/weekly?end=` | X-Family-Id | 週次サマリー（7日間、欠損はnull埋め） |
| POST | `/v1/admin/aggregate` | Bearer ADMIN_TOKEN | 集計+AI要約の手動実行 |

### 2. 認証設計

- **親（家族）認証**: `X-Family-Id` ヘッダ必須（401）、他家族のリソースは403
- **child_id の所有権確認**: 各ハンドラ内で D1 に問い合わせてチェック
- **管理者認証**: `Authorization: Bearer <ADMIN_TOKEN>` 必須（401）
- **子の認証**: なし（アプリ上の親設定フローでのみペアリング）

### 3. ペアリングフロー

1. 親アプリが `POST /v1/pairing/create` → 6桁コード + family_id + QRペイロードを取得
2. 子アプリがコードを入力 → `POST /v1/pairing/redeem` → family_id + child_id を取得
3. コードは KV（10分TTL）に保存、読み取りと同時に削除（使い捨て）
4. child の home/school は `0,0` で仮登録、Swift側で後入力

### 4. スコアリング

- `SCORING_IMPL` 環境変数で "mock" | "real" を切替
- **mock**: `score.ts` の `hashScore()` + `timeBonus()` で擬似乱数的スコア（0-100）
  - 時間帯補正: 6-14時=0, 15-16時=+6, 17-18時=+18, 19-5時=+28
  - `levelFromScore`: 0-33=safe, 34-66=caution, 67-100=danger
  - factors: refuge / crime / traffic / lighting
  - 避難所 `nearestRefuges()`: 固定4件から擬似選択
- **real**: 当日オープンデータ連携用スタブ（未実装）

### 5. スコアリングI/F (scoring/index.ts)

全スコアリングモジュールは以下の3関数のインターフェースに従う：

```typescript
interface ScoringImpl {
  scorePoint(input: ScorePointInput): ScorePointResult       // 1地点
  scoreGrid(input: ScoreGridInput): ScoreGridResult           // グリッド
  nearestRefuge(input: NearestRefugeInput): NearestRefugeResult // 避難所
}
```

### 6. 位置情報の永続化

```sql
-- UPSERT: 同一 child_id + at は上書き
INSERT INTO location (child_id, lat, lng, at, score, level, factors, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (child_id, at) DO UPDATE SET ...
```

### 7. 日次集計エンジン（Phase 4）

`aggregateDaily()` の処理フロー:

1. **D1取得**: 指定 child_id × date の全 location を `ORDER BY at ASC`
2. **ホットスポット抽出**: `extractHotspots()`
   - score >= 67 の点をフィルタ
   - 5分以内かつ200m以内の点をクラスタリング
   - クラスタ内の最大 score 点を代表点に
   - 最大5件まで、時刻昇順、hotspot_id 採番
3. **総合スコア**: `computeTotalScore()`
   - 各点の滞在時間（次の点との差分、最終点は直前の差分を流用）
   - スコア × 滞在時間の加重平均
   - ホットスポット数 × 5 のペナルティ加算（上限15）
   - `min(100, round(avg + penalty))`
4. **ベースライン**: `computeBaseline()`
   - 過去14日分の同じchildのready daily から中央値
   - 7日未満の履歴は null
5. **統計**: `computeStats()` → 距離・時間・件数・出発/到着時刻
6. **D1保存**: `daily` テーブルに UPSERT

### 8. AI要約（Phase 5）

- `AI_PROVIDER` 環境変数で "workers-ai" | "anthropic" | "template" 切替
- Workers AI: `@cf/qwen/qwen3-30b-a3b-fp8`, 10秒タイムアウト
- Anthropic: `claude-haiku-4-5`, 10秒タイムアウト
- **フォールバック**: AI呼び出し失敗時は template（固定文面）にフォールバック
- **例外安全性**: AI生成が例外を投げても集計自体は status:'ready' を維持
- **`[ai]` バインディング**: wrangler.tomlではコメントアウト中。有効化するとローカルでもリモートWorkerに繋がるため注意
- **AI応答パース**: 生JSONと ```json フェンス両対応

### 9. Cron / 集計トリガー

- `wrangler.toml`: `crons = ["0 13 * * *"]` → 22:00 JST
- `scheduled()`: 当日の全 child の位置データを集計 → AI要約まで一括
- `POST /v1/admin/aggregate`: 手動トリガー（本番デモ用）

### 10. DBスキーマ (D1 / SQLite)

```sql
CREATE TABLE family (family_id TEXT PK, created_at TEXT);
CREATE TABLE child (child_id TEXT PK, family_id TEXT, name TEXT, grade TEXT,
  home_lat REAL, home_lng REAL, school_lat REAL, school_lng REAL, created_at TEXT);
CREATE TABLE location (id INTEGER PK AUTOINCREMENT, child_id TEXT, lat REAL, lng REAL,
  at TEXT, score INTEGER, level TEXT, factors TEXT, created_at TEXT);
CREATE INDEX idx_location_child_at ON location (child_id, at); -- UPSERT用
CREATE TABLE daily (child_id TEXT, date TEXT, status TEXT, total_score INTEGER,
  level TEXT, baseline_score INTEGER, diff_from_baseline INTEGER,
  hotspots TEXT, summary TEXT, stats TEXT, generated_at TEXT,
  PRIMARY KEY (child_id, date));
CREATE INDEX idx_daily_child_date ON daily (child_id, date);
```

- `location.at` は JST ISO8601 文字列（例: `2026-08-21T15:00:00+09:00`）
- `factors` / `hotspots` / `summary` / `stats` は JSON 文字列で保存
- `daily.status`: "ready" | "no_data" | "pending"（行未存在）

### 11. レート制限

- `POST /v1/locations`: 同一 child_id で 1分間に60リクエスト
- KV の固定ウィンドウ方式（厳密さより実装単純さ優先）
- 超過時: 429 `RATE_LIMITED`

### 12. エラーレスポンス形式

全エラーレスポンスは統一フォーマット:
```json
{ "error": { "code": "UPPER_SNAKE_CASE", "message": "人間可読な日本語" } }
```

### 13. 環境変数 / バインディング

| 変数 | 用途 | 既定値 | 備考 |
|------|------|--------|------|
| `DB` | D1 バインディング | 必須 | wrangler.toml |
| `PAIRING_KV` | KV バインディング | 必須 | wrangler.toml |
| `SCORING_IMPL` | スコアリング実装切替 | `"mock"` | `"mock"` / `"real"` |
| `AI_PROVIDER` | AIプロバイダ切替 | `"template"` | `"workers-ai"` / `"anthropic"` / `"template"` |
| `ADMIN_TOKEN` | 管理API認証 | なし | 秘密（secrets） |
| `ANTHROPIC_API_KEY` | Anthropic API Key | なし | 秘密（secrets） |
| `AI` | Workers AI バインディング | なし | wrangler.toml でコメントアウト中 |

## /docs 運用ルール

作業内容は `/docs` にどんどん記録していく。

- フォーマットは Markdown（.md）
- 冒頭に必ず以下を記載する
    - 誰が（sochan または tadas）
    - 使用モデル
    - 日時
- 書いたら都度コミットする
- 大きなフェーズの区切りごとに書くのが基本だが、取りこぼし防止のため、小さい変更でも積極的に記録すること

### 記録の書き方（例）

```markdown
---
担当: tadas
モデル: Claude Sonnet 5
日時: 2026-08-22 10:30
---

# タイトル

やったこと・決めたことを書く。
```

## Git運用

- ブランチは **main のみ**（共通ブランチ、mainのみで運用）
- **相手が書いたコードを勝手に変更しない**（コンフリクト防止のため）

## その他

- このCLAUDE.mdはプロジェクトの進行に合わせて更新し続けること。ただし、プロジェクトに関することのみ書くこと。自分の好みの設定は、個人のCLAUDE.mdへ。
- tadasの場合、.claude/settings.mdを見てから始めること。これは、自由に変更して良い。

## 使用スキル

以下のスキルが利用可能です。`skills-lock.json` で管理しており、初回セットアップ時に以下を実行してインストールしてください。

```bash
npx skills install
```

スキルは `.gitignore` 対象のためリポジトリには含まれません。

- [agents-sdk](https://skills.sh/cloudflare/skills/agents-sdk) — ステートフルエージェント・Workflows・WebSocket
- [cloudflare](https://skills.sh/cloudflare/skills/cloudflare) — Cloudflare 全般（Workers, D1, KV, R2, AI等）
- [wrangler](https://skills.sh/cloudflare/skills/wrangler) — wrangler CLI 操作
- [workers-best-practices](https://skills.sh/cloudflare/skills/workers-best-practices) — Workers 実装のベストプラクティス
- [durable-objects](https://skills.sh/cloudflare/skills/durable-objects) — Durable Objects の実装・レビュー