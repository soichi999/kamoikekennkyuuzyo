---
担当: tadas
モデル: Claude Sonnet 5
日時: 2026-08-21 11:40
---

# apps/worker を Hono + TypeScript に移行

## やったこと

Phase 1 モックAPI（素のJavaScript実装）を、今後の保守性を考えて Hono フレームワーク + TypeScript に移行した。

1. `src/index.js` を Hono (`app.get`/`app.post`/`app.notFound`/`hono/cors`) を使った実装に書き換え
2. スコア算出ロジック（ハッシュ関数・時間帯ボーナス・factors組み立て等）を `src/score.ts` に分離
3. TypeScript化: `src/index.ts` / `src/score.ts`、`tsconfig.json` を新規作成、`@cloudflare/workers-types` 導入
4. `package.json` を新規作成（`hono`, `wrangler`, `typescript`, `@cloudflare/workers-types`）。`npm run dev` / `deploy` / `typecheck` を用意
5. `wrangler.toml` の `main` を `src/index.ts` に変更
6. `.gitignore`（`node_modules/`, `.wrangler/`）を追加
7. `README.md` にセットアップ手順（`npm install`）と型チェック手順を追記

## 確認したこと

- **レスポンス形は一切変更していない**（`API.md` / `KakekomiAPI.swift` は無改修）。全エンドポイントのURL・レスポンスJSON・エラーコード・CORS挙動・スコア算出ロジック・ダミーデータはPhase1と完全に同じ挙動になるよう移植した
- `npm run typecheck`（`tsc --noEmit`）でエラーなし
- 一時的にJSへトランスパイルし、Node.jsから直接importして全エンドポイント（正常系・異常系）+ 決定論性（同一座標で同一スコア）+ 時間帯ボーナス（夜間の方がスコアが高い）を再検証。移行前と同じ数値が返ることを確認済み
- `wrangler dev` / `wrangler deploy` はこの作業では実行していない（別アカウントのため）

## 実装の分担について

Phase1本体とHono移行・TypeScript化は、`opencode run -m openrouter/deepseek/deepseek-v4-flash` に実装させ、こちらでtypecheck・re-testして検証する形で進めた。
