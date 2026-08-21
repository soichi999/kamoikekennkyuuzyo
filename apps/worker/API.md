# カケコミ API 仕様書 (Phase 1)

## 重要

Phase 1 は全エンドポイントがダミーデータを返します。ただし**レスポンスの形は Phase 2（本実装）でも変えません**。
開発の初期から UI を正しいデータ形式に合わせて実装できます。

---

## 画面 ↔ エンドポイント対応表

| 画面 | 使用するエンドポイント |
|---|---|
| 週間グラフ | `GET /v1/children/{child_id}/weekly` |
| 今日の危険ポイント | `GET /v1/children/{child_id}/daily` |
| マップ（全画面のベース） | `GET /v1/children/{child_id}/daily`（軌跡）+ `GET /v1/grid`（ヒートマップ） |
| ピン長押し（地点詳細） | `GET /v1/score` |
| 子アプリ（ヒートマップのみ） | `GET /v1/grid`（ヒートマップ）+ `POST /v1/locations`（位置送信） |
| ペアリング（親） | `POST /v1/pairing/create` |
| ペアリング（子） | `POST /v1/pairing/redeem` |
| 子どもの一覧 | `GET /v1/family/{family_id}/children` |

---

## 共通ルール

### スコアとレベル

- `score`: 0〜100 の整数。**高い = 危険**です。
- `level`: `score` から自動算出される文字列です。次の値のいずれかになります。
  - `safe` (0–33)
  - `caution` (34–66)
  - `danger` (67–100)
- **色分けは必ず `level` で分岐してください。** `score` の数値で閾値分岐をしてはいけません。閾値が変わっても Swift 側を修正しなくて済むようにするためです。

### 時刻

- すべて ISO8601 形式、タイムゾーンは `+09:00`（日本標準時 JST）です。
- 例: `2026-08-21T12:10:00+09:00`

### 認証

Phase 1 では認証は不要です。Phase 2 で `X-Family-Id` ヘッダによる認証を追加予定です。

### CORS

全オリジンからのアクセスを許可しています（`Access-Control-Allow-Origin: *`）。
`OPTIONS` リクエストには 204 No Content を返します。

### エラーレスポンス

すべてのエラーは以下の形式で返ります。

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "人間が読めるエラーメッセージ"
  }
}
```

---

## エンドポイント一覧

### `POST /v1/pairing/create`

ペアリングコードを生成します（親アプリが呼びます）。リクエストボディは不要です。

**リクエスト**: なし（空の POST）

**レスポンス例**:
```json
{
  "code": "482915",
  "family_id": "fam_8f2a1c94",
  "expires_at": "2026-08-21T12:10:00+09:00",
  "qr_payload": "kakekomi://pair?code=482915"
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `code` | string | 6桁の数字。ペアリングコード |
| `family_id` | string | ファミリーID (`fam_` + 英数字8文字) |
| `expires_at` | string (ISO8601) | コードの有効期限（作成から10分後） |
| `qr_payload` | string | QRコードに埋め込むディープリンク |

---

### `POST /v1/pairing/redeem`

ペアリングコードを消費して子を登録します（子アプリが呼びます）。

**リクエスト**:
```json
{
  "code": "482915",
  "child_name": "はると"
}
```

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `code` | string | 必須 | ペアリングコード (6桁数字) |
| `child_name` | string | 任意 | 子どもの名前 |

**レスポンス例**:
```json
{
  "family_id": "fam_8f2a1c94",
  "child_id": "chd_3b7e05d1",
  "name": "はると",
  "paired_at": "2026-08-21T12:03:00+09:00"
}
```

**エラー**:
| コード | HTTP ステータス | 条件 |
|---|---|---|
| `MISSING_CODE` | 400 | `code` が未指定または空文字 |
| `CODE_NOT_FOUND` | 404 | `code` が `"000000"`（テスト用の固定ケース） |

---

### `GET /v1/family/{family_id}/children`

ファミリーに所属する子どもの一覧を取得します（親アプリが呼びます）。

**レスポンス例**:
```json
{
  "children": [
    {
      "child_id": "chd_3b7e05d1",
      "name": "はると",
      "grade": "小学4年",
      "home": { "lat": 35.6421, "lng": 139.6532 },
      "school": { "lat": 35.6478, "lng": 139.6601 },
      "paired_at": "2026-08-14T19:20:00+09:00"
    }
  ]
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `children[].child_id` | string | 子どもID (`chd_` + 英数字) |
| `children[].name` | string | 子どもの名前 |
| `children[].grade` | string | 学年 |
| `children[].home` | object | 自宅の座標 `{ lat, lng }` |
| `children[].school` | object | 学校の座標 `{ lat, lng }` |
| `children[].paired_at` | string (ISO8601) | ペアリング日時 |

---

### `POST /v1/locations`

子どもの位置情報を送信し、同時にスコア化して返します（子アプリが定期的に呼びます）。

**リクエスト**:
```json
{
  "child_id": "chd_3b7e05d1",
  "points": [
    { "lat": 35.6478, "lng": 139.6601, "at": "2026-08-20T15:42:00+09:00" }
  ]
}
```

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `child_id` | string | 必須 | 子どもID |
| `points` | array | 必須 | 位置情報の配列。最大500件 |
| `points[].lat` | number | 必須 | 緯度 |
| `points[].lng` | number | 必須 | 経度 |
| `points[].at` | string (ISO8601) | 任意 | 観測時刻（省略時は現在時刻 JST） |

**レスポンス例**:
```json
{
  "accepted": 1,
  "results": [
    {
      "lat": 35.6478,
      "lng": 139.6601,
      "at": "2026-08-20T15:42:00+09:00",
      "score": 68,
      "level": "danger",
      "factors": [
        { "key": "refuge", "label": "駆け込み先", "impact": 17, "detail": "半径300m内に0件" }
      ]
    }
  ],
  "current": { "score": 81, "level": "danger" }
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `accepted` | number | 受け付けたポイント数 |
| `results[]` | array | 各ポイントのスコア結果 |
| `results[].score` | number | 0〜100のスコア |
| `results[].level` | string | `safe` / `caution` / `danger` |
| `results[].factors` | array | スコアに寄与した要因 |
| `current` | object | このリクエスト内で最大スコアのもの |

**エラー**:
| コード | HTTP ステータス | 条件 |
|---|---|---|
| `MISSING_CHILD_ID` | 400 | `child_id` が未指定 |
| `MISSING_POINTS` | 400 | `points` が未指定または配列でない |
| `TOO_MANY_POINTS` | 400 | `points` が500件超 |

---

### `GET /v1/grid?bbox=&zoom=&at=`

ヒートマップ用のグリッドデータを返します。

**クエリパラメータ**:
| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| `bbox` | string | 必須 | `minLng,minLat,maxLng,maxLat` のカンマ区切り |
| `zoom` | number | 任意 | ズームレベル（Phase 1では使用しません） |
| `at` | string (ISO8601) | 任意 | 時刻（省略時は現在時刻 JST） |

**レスポンス例**:
```json
{
  "cell_size_m": 100,
  "at": "2026-08-20T18:00:00+09:00",
  "count": 56,
  "cells": [
    { "lat": 35.6421, "lng": 139.6532, "score": 42, "level": "caution" }
  ]
}
```

- セルの南西角の座標を返します。
- セルサイズは約100m四方（緯度経度0.0009刻み）です。
- 最大2000件まで返します。

**エラー**:
| コード | HTTP ステータス | 条件 |
|---|---|---|
| `MISSING_BBOX` | 400 | `bbox` 未指定 |
| `INVALID_BBOX` | 400 | bboxの値が4つ揃っていない / パース不可 / min >= max |

---

### `GET /v1/score?lat=&lng=&at=`

指定した地点の単発スコアを返します（ピン長押し・地点詳細表示用）。

**クエリパラメータ**:
| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| `lat` | number | 必須 | 緯度 |
| `lng` | number | 必須 | 経度 |
| `at` | string (ISO8601) | 任意 | 時刻（省略時は現在時刻 JST） |

**レスポンス例**:
```json
{
  "lat": 35.6455,
  "lng": 139.6566,
  "at": "2026-08-20T18:00:00+09:00",
  "score": 41,
  "level": "caution",
  "factors": [
    { "key": "refuge", "label": "駆け込み先", "impact": 10, "detail": "半径300m内に1件" }
  ],
  "title": "この地点",
  "reason": "周辺の平均的な水準です",
  "nearest_refuge": [
    { "type": "kodomo110", "name": "山田商店", "distance_m": 210 }
  ]
}
```

- `nearest_refuge[].type` は `koban`（交番） / `school`（学校） / `kodomo110`（こども110番） / `public`（公共施設） のいずれかです。

**エラー**:
| コード | HTTP ステータス | 条件 |
|---|---|---|
| `MISSING_LATLNG` | 400 | `lat` または `lng` が未指定 |

---

### `GET /v1/children/{child_id}/daily?date=`

指定した日の子どもの下校結果（軌跡・危険ポイント・サマリー）を返します。

**クエリパラメータ**:
| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| `date` | string (YYYY-MM-DD) | 任意 | 日付（省略時は当日 `2026-08-20` 扱い） |

**レスポンス例（データ準備完了）**:
```json
{
  "child_id": "chd_3b7e05d1",
  "date": "2026-08-20",
  "status": "ready",
  "total_score": 64,
  "level": "caution",
  "baseline_score": 39,
  "diff_from_baseline": 25,
  "track": [ ... 8点ほどの位置情報 ... ],
  "hotspots": [
    {
      "hotspot_id": "hs_01",
      "lat": 35.6455,
      "lng": 139.6566,
      "score": 81,
      "level": "danger",
      "at": "2026-08-20T15:45:00+09:00",
      "title": "桜丘二丁目 高架下",
      "reason": "駆け込み先ゼロ・見通し不良",
      "factors": [
        { "key": "refuge", "label": "駆け込み先", "impact": 20, "detail": "半径300m内に0件" },
        { "key": "lighting", "label": "街灯", "impact": 12, "detail": "街灯が少ない区間" }
      ],
      "stay_minutes": 6
    }
  ],
  "summary": {
    "for_parent": "高架下の区間で駆け込み先が少なく、17時台は薄暗くなります。帰り道を一緒に確認し、明るい大通り側を通るよう伝えてあげてください。",
    "for_child": "かえりみちの　たかいかどうしたに　あぶないところが　あるよ。くらくなるまえに　とおろうね。",
    "talking_points": [
      "高架下は明るい時間帯に通る",
      "何かあったらコンビニに駆け込む",
      "帰宅時刻を決めておく"
    ],
    "generated_at": "2026-08-20T22:00:12+09:00",
    "model": "mock"
  },
  "stats": {
    "distance_m": 1840,
    "duration_min": 42,
    "point_count": 8,
    "departed_at": "2026-08-20T15:30:00+09:00",
    "arrived_at": "2026-08-20T16:12:00+09:00"
  }
}
```

**レスポンス例（集計未完了）**:
```json
{
  "status": "pending",
  "message": "この日の集計はまだ実行されていません"
}
```
`date` が今日（2026-08-20）より未来の日付の場合は pending が返ります。

| フィールド | 説明 |
|---|---|
| `total_score` | その日の総合スコア |
| `baseline_score` | 基準スコア（当該ルートの平均的な危険度） |
| `diff_from_baseline` | 基準との差分 |
| `track` | 下校ルートの位置情報配列 |
| `hotspots` | 注意すべき地点の詳細リスト |
| `summary.for_parent` | 保護者向けのアドバイス |
| `summary.for_child` | 子ども向けのアドバイス（ひらがな多め） |
| `summary.talking_points` | 会話のきっかけとなるトピック |
| `summary.generated_at` | サマリー生成日時 |
| `summary.model` | サマリー生成に使われたモデル名（Phase 1 は `mock`） |
| `stats` | ルートの統計情報 |

---

### `GET /v1/children/{child_id}/weekly?end=`

週間のスコア推移を返します。

**クエリパラメータ**:
| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| `end` | string (YYYY-MM-DD) | 任意 | 週の最終日（省略時は `2026-08-20`） |

**レスポンス例**:
```json
{
  "child_id": "chd_3b7e05d1",
  "end": "2026-08-20",
  "days": [
    { "date": "2026-08-14", "total_score": 38, "level": "caution", "has_hotspot": false },
    { "date": "2026-08-15", "total_score": 42, "level": "caution", "has_hotspot": false },
    { "date": "2026-08-16", "total_score": 55, "level": "caution", "has_hotspot": true },
    { "date": "2026-08-17", "total_score": 61, "level": "caution", "has_hotspot": true },
    { "date": "2026-08-18", "total_score": 33, "level": "safe", "has_hotspot": false },
    { "date": "2026-08-19", "total_score": 47, "level": "caution", "has_hotspot": false },
    { "date": "2026-08-20", "total_score": 39, "level": "caution", "has_hotspot": false }
  ],
  "average": 42,
  "baseline_score": 39
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `days[].date` | string (YYYY-MM-DD) | 日付（古い順） |
| `days[].total_score` | number | その日の総合スコア |
| `days[].level` | string | 安全レベル |
| `days[].has_hotspot` | boolean | 危険ポイントがあったか |
| `average` | number | 7日間の平均スコア |
| `baseline_score` | number | 基準スコア |

---

### `GET /` および `GET /v1`

ヘルスチェック兼エンドポイント一覧を返します。

```json
{
  "app": "カケコミ API",
  "version": "1.0.0",
  "phase": "1 (mock)",
  "endpoints": [ ... ]
}
```

---

### 存在しないパス

上記以外のパスに対しては 404 を返します。

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "パス /xxx は存在しません"
  }
}
```

---

## エラーコード一覧

| コード | HTTP ステータス | 発生条件 |
|---|---|---|
| `MISSING_CODE` | 400 | pairing/redeem で `code` が未指定または空文字 |
| `CODE_NOT_FOUND` | 404 | pairing/redeem で `code` が `"000000"`（テスト用） |
| `MISSING_CHILD_ID` | 400 | locations 送信で `child_id` が未指定 |
| `MISSING_POINTS` | 400 | locations 送信で `points` が未指定または配列でない |
| `TOO_MANY_POINTS` | 400 | locations 送信で `points` が500件超 |
| `MISSING_BBOX` | 400 | grid で `bbox` パラメータ未指定 |
| `INVALID_BBOX` | 400 | grid で `bbox` の値が不正 |
| `MISSING_LATLNG` | 400 | score で `lat` または `lng` が未指定 |
| `NOT_FOUND` | 404 | 存在しないパスへのアクセス |

---

## Phase 2 で変わること／変えないこと

### 変えないこと（互換性を保証）

- すべてのレスポンスのJSONの「形」（フィールド名、フィールドの型、ネスト構造）
- `score` / `level` の定義（0–100整数、safe/caution/danger）
- エラーレスポンスの形式 `{ "error": { "code": "...", "message": "..." } }`
- 全エンドポイントのURLパス

### 変わること

- **データベース**: D1 (SQLite) を導入。ダミーデータではなく実際の登録データを返すようになります。
- **KV**: ペアリングコードの一時保存・期限切れ処理に KV を使用します。
- **Cron Triggers**: 毎日22:00 JST に日次集計を実行し、サマリーを生成します。
- **認証**: `X-Family-Id` ヘッダによる認証が必要になります。
- **サマリー生成**: `summary.for_parent` / `summary.for_child` / `talking_points` が Workers AI による実際の文章生成になります（`model` は `mock` から `llama-4-scout` 相当に変わります）。
- **実際のデータに基づくスコア**: 位置情報・犯罪統計・街灯データ等を反映した算出になります。