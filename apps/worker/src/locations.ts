import { jstNow, toJSTString, type LocationResult } from './score.js'
import type { Env } from './types.js'

// 同一 child_id + 同一 at は上書き（UPSERT）する。
export async function saveLocations(env: Env, childId: string, results: LocationResult[]): Promise<void> {
  if (results.length === 0) return
  const now = toJSTString(jstNow())
  const stmt = env.DB.prepare(
    `INSERT INTO location (child_id, lat, lng, at, score, level, factors, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (child_id, at) DO UPDATE SET
       lat = excluded.lat,
       lng = excluded.lng,
       score = excluded.score,
       level = excluded.level,
       factors = excluded.factors,
       created_at = excluded.created_at`
  )
  const batch = results.map(r =>
    stmt.bind(childId, r.lat, r.lng, r.at, r.score, r.level, JSON.stringify(r.factors), now)
  )
  await env.DB.batch(batch)
}
