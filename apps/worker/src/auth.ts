import type { Context, Next } from 'hono'
import type { Env, Variables } from './types.js'

interface ErrorBody {
  error: { code: string; message: string }
}

type AppContext = Context<{ Bindings: Env; Variables: Variables }>

// X-Family-Id ヘッダの存在を検証し、後続ハンドラで使えるように c.set('familyId', ...) する。
// child の所有権チェック（403）は各ハンドラ側で行う（child_id の取得元がパスとbodyで異なるため）。
export async function requireFamilyAuth(c: AppContext, next: Next) {
  const familyId = c.req.header('X-Family-Id')
  if (!familyId) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'X-Family-Id ヘッダが必要です' } } satisfies ErrorBody, 401 as const)
  }
  c.set('familyId', familyId)
  await next()
}

export function forbidden(c: AppContext) {
  return c.json({ error: { code: 'FORBIDDEN', message: 'このリソースへのアクセス権がありません' } } satisfies ErrorBody, 403 as const)
}
