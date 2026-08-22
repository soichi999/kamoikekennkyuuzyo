import path from 'node:path'
import { defineConfig } from 'vitest/config'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'

export default defineConfig(async () => {
  const migrationsPath = path.join(import.meta.dirname, 'migrations')
  const migrations = await readD1Migrations(migrationsPath)
  return {
    test: {
      setupFiles: ['./test/apply-migrations.ts'],
    },
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          // AI_PROVIDER はテスト環境では必ず 'template' に固定する。
          // wrangler.toml では [ai] バインディングが有効なため、上書きしないと
          // テストが実際のリモート Workers AI を呼び出し（課金・タイムアウト）してしまう。
          // workers-ai 経路のテストは phase5 のようにテスト側でフェイク AI を注入して行う。
          bindings: {
            TEST_MIGRATIONS: migrations,
            ADMIN_TOKEN: 'test-admin-token',
            AI_PROVIDER: 'template',
          },
        },
      }),
    ],
  }
})
