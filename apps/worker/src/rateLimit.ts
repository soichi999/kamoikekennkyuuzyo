import type { Env } from './types.js'

const WINDOW_SECONDS = 60
const MAX_REQUESTS_PER_WINDOW = 60

// ペアリングコード総当たり対策。1分あたりの「失敗」許容回数。
// 6桁 = 10^6 通りを 20回/分 で舐めるには約35日かかり、コードのTTL(10分)を大きく超える。
export const MAX_PAIRING_FAILURES_PER_WINDOW = 20

function windowKey(prefix: string, key: string, windowSeconds: number): string {
  const windowId = Math.floor(Date.now() / 1000 / windowSeconds)
  return `${prefix}:${key}:${windowId}`
}

async function readCount(env: Env, kvKey: string): Promise<number> {
  const current = await env.PAIRING_KV.get(kvKey)
  return current ? parseInt(current, 10) : 0
}

async function bump(env: Env, kvKey: string, windowSeconds: number): Promise<void> {
  const count = await readCount(env, kvKey)
  await env.PAIRING_KV.put(kvKey, String(count + 1), { expirationTtl: windowSeconds * 2 })
}

// KVを使ったシンプルな固定ウィンドウ・レート制限。厳密さより実装の単純さを優先する。
// 成功・失敗を問わず全リクエストを数える。上限に達していれば false を返す。
export async function checkRateLimit(
  env: Env,
  key: string,
  max: number = MAX_REQUESTS_PER_WINDOW,
  windowSeconds: number = WINDOW_SECONDS,
): Promise<boolean> {
  const kvKey = windowKey('ratelimit', key, windowSeconds)
  const count = await readCount(env, kvKey)
  if (count >= max) {
    return false
  }
  await env.PAIRING_KV.put(kvKey, String(count + 1), { expirationTtl: windowSeconds * 2 })
  return true
}

// 「失敗」だけを数えるレート制限。
// 総当たり攻撃は失敗が大量に出るのに対し、正当な利用はほぼ成功するため、
// 会場のWi-Fiのように多数の利用者がひとつのグローバルIPを共有する環境でも、
// 正当な操作を巻き込んで 429 にしてしまう事故が起きにくい。
export async function isFailureLimited(
  env: Env,
  key: string,
  max: number,
  windowSeconds: number = WINDOW_SECONDS,
): Promise<boolean> {
  const count = await readCount(env, windowKey('faillimit', key, windowSeconds))
  return count >= max
}

export async function recordFailure(
  env: Env,
  key: string,
  windowSeconds: number = WINDOW_SECONDS,
): Promise<void> {
  await bump(env, windowKey('faillimit', key, windowSeconds), windowSeconds)
}
