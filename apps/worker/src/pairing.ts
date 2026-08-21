import { jstNow, toJSTString, randomString, randomDigits } from './score.js'
import type { Env } from './types.js'

const PAIRING_TTL_SECONDS = 600

export interface CreatePairingResult {
  code: string
  familyId: string
  expiresAt: Date
}

export async function createPairing(env: Env): Promise<CreatePairingResult> {
  const familyId = 'fam_' + randomString(8)
  const now = jstNow()
  await env.DB.prepare('INSERT INTO family (family_id, created_at) VALUES (?, ?)')
    .bind(familyId, toJSTString(now))
    .run()

  const code = randomDigits(6)
  await env.PAIRING_KV.put(`pairing:${code}`, familyId, { expirationTtl: PAIRING_TTL_SECONDS })

  const expiresAt = new Date(now.getTime() + PAIRING_TTL_SECONDS * 1000)
  return { code, familyId, expiresAt }
}

export type RedeemPairingResult =
  | { ok: true; familyId: string; childId: string; name: string; pairedAt: Date }
  | { ok: false; reason: 'CODE_NOT_FOUND' }

export async function redeemPairing(env: Env, code: string, childName: string | undefined): Promise<RedeemPairingResult> {
  const key = `pairing:${code}`
  const familyId = await env.PAIRING_KV.get(key)
  if (!familyId) {
    return { ok: false, reason: 'CODE_NOT_FOUND' }
  }
  // 使い捨てコードのため即削除する
  await env.PAIRING_KV.delete(key)

  const childId = 'chd_' + randomString(8)
  const now = jstNow()
  const name = childName || '名無し'
  // home/school は未取得のため 0,0 で仮登録する。Swift側の追加入力フローで更新する想定。
  await env.DB.prepare(
    `INSERT INTO child (child_id, family_id, name, grade, home_lat, home_lng, school_lat, school_lng, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(childId, familyId, name, '', 0, 0, 0, 0, toJSTString(now))
    .run()

  return { ok: true, familyId, childId, name, pairedAt: now }
}

export interface ChildRow {
  child_id: string
  name: string
  grade: string
  home_lat: number
  home_lng: number
  school_lat: number
  school_lng: number
  created_at: string
}

export async function listChildren(env: Env, familyId: string): Promise<ChildRow[]> {
  const { results } = await env.DB.prepare(
    'SELECT child_id, name, grade, home_lat, home_lng, school_lat, school_lng, created_at FROM child WHERE family_id = ?'
  )
    .bind(familyId)
    .all<ChildRow>()
  return results
}

export async function getChildFamilyId(env: Env, childId: string): Promise<string | null> {
  const row = await env.DB.prepare('SELECT family_id FROM child WHERE child_id = ?')
    .bind(childId)
    .first<{ family_id: string }>()
  return row ? row.family_id : null
}
