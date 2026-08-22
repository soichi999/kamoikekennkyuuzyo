---
担当: tadas
モデル: Claude Opus 5
日時: 2026-08-22 12:00
---

# デプロイ前のセキュリティ対策 D・E を実装

`docs/2026-08-22_ai-model-fix-and-privacy-audit.md` の監査で挙げた対策のうち、
**D（暗号論的に安全なID生成）** と **E（ペアリングコードのレート制限）** を実装した。
API 契約は変わらないため Swift 側（sochan）への影響は無い。

## D: `Math.random()` を廃止

`family_id` / `child_id` / ペアリングコードはすべて `crypto.getRandomValues()` 生成に変更。

- `src/score.ts`: `randomString()` は**ちょうど32文字**のアルファベット
  （`0123456789abcdefghjkmnpqrstvwxyz`、紛らわしい `i/l/o/u` を除外）を使い、
  ビットマスク `& 31` で剰余バイアス無しに選ぶ
- `randomDigits()` は rejection sampling（250以上のバイトを捨てる）で 0-9 を一様に生成
- `src/pairing.ts`: `fam_`/`chd_` に続く長さを **8文字 → 22文字**（32^22 ＝ 約110bit）へ

`family_id` は `X-Family-Id` としてそのまま認証に使われるため、
推測可能だと他家族の位置履歴を読まれる。ここが監査の #1 + #2 の核心だった。

**注意**: これで family_id は実質 bearer token 相当の強度になるが、
`GET /v1/family/{family_id}/children` は**秘密値をURLパスに載せている**構造のまま。
URLはアクセスログに残るのでヘッダに載せるより筋が悪い。本質的な修正は対策 C（要 sochan 相談）。

## E: redeem のレート制限（失敗回数ベース）

6桁コード＝10^6 通りしかないため総当たりが現実的だった。同一IPからの**失敗**を
1分あたり20回に制限（`MAX_PAIRING_FAILURES_PER_WINDOW`）。20回/分では全数走査に約35日かかり、
コードのTTL（10分）を大きく超える。

### なぜ「失敗回数」ベースにしたか

素朴なIP単位のレート制限にすると、**会場Wi-Fiで事故る**。
redeem は認証が無いのでキーに使えるのは実質IPだけだが、会場は NAT で全員が同一の
グローバルIPを共有する。デモ中に複数人が同時にペアリングすると、正当な操作が壇上で 429 になる。

- 総当たり攻撃 → 失敗が大量に出る → 弾ける
- 正当なデモ → ほぼ成功する → カウントされない

`src/rateLimit.ts` に `isFailureLimited()` / `recordFailure()` を追加。
既存の `checkRateLimit()` は上限・ウィンドウを引数化したが、既定値は従来どおり（60回/60秒）。

## その他

- `src/index.ts`: 未使用だった `randomString` / `randomDigits` の import を削除
- `API.md`: ID 形式（22文字）、redeem の 429、`CODE_NOT_FOUND` の条件を実装に合わせて修正
    - 従来「`code` が `"000000"` のとき404」と書かれていたが、これは Phase 1 のモック時代の記述で実装と乖離していた
- `CLAUDE.md`: 認証設計・ペアリング・レート制限の項を更新

## テスト

`test/phase7-security.test.ts` を新規追加（7件）。

- `randomString` が限定アルファベットのみを使い、200回呼んで重複しない
- `randomDigits` が6桁で、3000桁中に0-9が全て出る（剰余バイアスの粗い検査）
- `family_id` / `child_id` が `fam_`/`chd_` + 22文字
- 失敗が上限を超えると 429 `RATE_LIMITED`
- 別IPは巻き込まれない
- **成功したペアリングはカウントされず、同一IPから上限を超えて成功できる**（E の設計意図そのもの）

全体で **47/47 パス**、typecheck も通過。

## 残っている未対応項目

監査の #4（位置ログの保持期間が無制限）、#5（削除API無し）、#6（座標の精度）、
#7（CORS `*`）、#8（timing-safe比較）、および #1 の本質的修正である C は**未対応**。
特に #4 / #6 は本番運用するなら必須。


---

# 本番デプロイ（2026-08-22 12:00〜13:00）

## デプロイ結果

- URL: **https://kakekomi-api.tokyo-odh-480.workers.dev**
- Cron: `0 13 * * *`（22:00 JST）登録済み
- バインディング: `DB` (kakekomi-db) / `PAIRING_KV` / `AI` / `SCORING_IMPL=mock` / `AI_PROVIDER=workers-ai`
- `ADMIN_TOKEN` は secret として設定済み

## 本番スモークテスト（全て期待通り）

| 確認項目 | 結果 |
| --- | --- |
| `GET /` ヘルスチェック | 200、`ai_provider: workers-ai` |
| `POST /v1/pairing/create` | `family_id` = `fam_` + 22文字、6桁コード |
| `POST /v1/pairing/redeem` | `child_id` = `chd_` + 22文字 |
| 同じコードの再利用 | 404（使い捨て動作） |
| `X-Family-Id` 無しでのアクセス | 401 |
| 他家族の child へのアクセス | 403 |
| `POST /v1/locations` | 5件 accepted |
| `GET /v1/score` | score=40 / caution |
| `POST /v1/admin/aggregate` 誤トークン | 401 |
| `GET /v1/children/{id}/daily` | status=ready |

## AI要約が動かなかった問題（原因2つ・解決済み）

デプロイ直後、`daily.summary.model` が `template` のままで、**gemma-4 が一度も使われていなかった**。
フォールバックが正常に効いていたため集計は `ready` を返しており、
`model` フィールドを見るまで気づけなかった。

### 原因1: 応答形状の取り違え

gemma-4 は **OpenAI 互換形式**を返す:

```json
{ "choices": [ { "message": { "content": "...", "reasoning_content": "..." }, "finish_reason": "stop" } ], "usage": {...} }
```

`workersAi.ts` は `result.response` を読んでいたため `undefined` になり、
フォールバックの `JSON.stringify(result)` がオブジェクト全体を文字列化していてパースに失敗していた。

→ `extractText()` を追加。OpenAI 互換形式を優先し、旧来の `{ response }` 形式も受け付ける。
`reasoning_content` ではなく `content` を使う点をテストで固定した。

### 原因2: 推論トークンが max_tokens を食い潰す

gemma-4 は推論モデルで、本文とは別に `reasoning_content` を生成する。
**この推論トークンも `max_tokens` を消費する**ため、上限が小さいと推論の途中で打ち切られ、
`content` が空文字のまま `finish_reason: "length"` で返ってくる。

実測:

| max_tokens | finish_reason | completion_tokens | 所要 | パース |
| --- | --- | --- | --- | --- |
| 1024 | length | 1024 | 12.2s | ✗（content 空） |
| 2048 | length | 2048 | 21.7s | ✗（28文字で途切れ） |
| **4096** | **stop** | **1291** | **14.1s** | **✓** |

→ `MAX_TOKENS = 4096`、`TIMEOUT_MS = 40000` に設定。

### 副次的な改善

AI 失敗時の `catch {}` が無言だったため本番で原因が追えなかった。
`console.error` を追加し、フォールバック理由・応答形状・パース失敗時の生テキスト（先頭300字）を記録するようにした。
位置情報が含まれうるため、生テキストは切り詰めて出力している。

## 動作確認済みの最終結果

```
AI model: @cf/google/gemma-4-26b-a4b-it
for_parent: **本日の安全情報** / 総合スコアは73で「危険」な状態です。…
for_child : **きょうの おやくそく** / **あぶない ばしょが あるよ** …
talking_points: 3件
```

## 注意点・残課題

- **AI要約の所要時間が 14〜26 秒とばらつく。** 推論トークン数が実行ごとに変動するため。
  Cron 経路は `waitUntil` なので問題ないが、`POST /v1/admin/aggregate` を
  デモ中に手で叩くと最大40秒待つ可能性がある。**デモ前に叩いて温めておくのが安全。**
- Workers AI バインディングは**ローカル実行でも常にリモート**。`wrangler dev` は課金対象。
- 監査項目 #4（保持期間）/ #5（削除API）/ #6（座標精度）/ #7（CORS）/ #8（timing-safe）/ C は**未対応のまま**。
