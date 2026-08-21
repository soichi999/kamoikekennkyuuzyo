import type { Env } from './types.js'

const WINDOW_SECONDS = 60
const MAX_REQUESTS_PER_WINDOW = 60

// KVを使ったシンプルな固定ウィンドウ・レート制限。厳密さより実装の単純さを優先する。
export async function checkRateLimit(env: Env, key: string): Promise<boolean> {
  const windowId = Math.floor(Date.now() / 1000 / WINDOW_SECONDS)
  const kvKey = `ratelimit:${key}:${windowId}`
  const current = await env.PAIRING_KV.get(kvKey)
  const count = current ? parseInt(current, 10) : 0
  if (count >= MAX_REQUESTS_PER_WINDOW) {
    return false
  }
  await env.PAIRING_KV.put(kvKey, String(count + 1), { expirationTtl: WINDOW_SECONDS * 2 })
  return true
}
