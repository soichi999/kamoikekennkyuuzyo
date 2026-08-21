---
担当: tadas
モデル: openrouter/deepseek/deepseek-v4-flash
日時: 2026-08-21 12:15
---

# スキルのインストール

## やったこと

このプロジェクトで使う Cloudflare 関連スキルを `.agents/skills/` にインストールした。

### インストールしたスキル

| スキル | パッケージ | 用途 |
|--------|-----------|------|
| agents-sdk | `cloudflare/skills@agents-sdk` | ステートフルエージェント, Workflows, WebSocket |
| cloudflare | `cloudflare/skills@cloudflare` | Cloudflare 全般 (Workers, D1, KV, R2, AI等) |
| wrangler | `cloudflare/skills@wrangler` | wrangler CLI 操作 |
| workers-best-practices | `cloudflare/skills@workers-best-practices` | Workers 実装のベストプラクティス |
| durable-objects | `cloudflare/skills@durable-objects` | Durable Objects の実装・レビュー |

`sandbox-sdk` は `cloudflare/skills` リポジトリに存在しなかったためスキップした（代わりに `sandbox-stable` / `sandbox-next` があるが、現状不要と判断）。

### インストールコマンド（参考）

```bash
npx skills add cloudflare/skills@<skill-name> -y
```

`-g` を付けずにプロジェクトルートで実行することで `.agents/skills/` にローカルインストールされる。

- `skills-lock.json` のみ管理し、`.agents/skills/` は `.gitignore` に追加した（`npx skills install` で再現可能）
- `CLAUDE.md` に初回セットアップ手順（`npx skills install`）を追記した
- 前回のコミットから `.agents/skills/` のファイルを除去してamendした
