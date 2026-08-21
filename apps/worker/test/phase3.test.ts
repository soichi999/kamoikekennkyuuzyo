import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:test'
import worker from '../src/index'

async function fetchApp(path: string, init?: RequestInit) {
  const req = new Request(`https://example.com${path}`, init)
  return worker.fetch(req, env as any, { waitUntil: () => {}, passThroughOnException: () => {} } as any)
}

async function pairChild(childName: string) {
  const createRes = await fetchApp('/v1/pairing/create', { method: 'POST' })
  const created = await createRes.json() as { code: string; family_id: string }
  const redeemRes = await fetchApp('/v1/pairing/redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: created.code, child_name: childName }),
  })
  const redeemed = await redeemRes.json() as { child_id: string }
  return { familyId: created.family_id, childId: redeemed.child_id }
}

async function countLocations(childId: string): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) as n FROM location WHERE child_id = ?')
    .bind(childId)
    .first<{ n: number }>()
  return row ? row.n : 0
}

describe('Phase 3: locations persistence', () => {
  it('posting points persists them to D1 and count matches', async () => {
    const { familyId, childId } = await pairChild('はると')
    const points = [
      { lat: 35.6478, lng: 139.6601, at: '2026-08-21T15:00:00+09:00' },
      { lat: 35.6470, lng: 139.6590, at: '2026-08-21T15:05:00+09:00' },
      { lat: 35.6460, lng: 139.6580, at: '2026-08-21T15:10:00+09:00' },
    ]
    const res = await fetchApp('/v1/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Family-Id': familyId },
      body: JSON.stringify({ child_id: childId, points }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { accepted: number }
    expect(body.accepted).toBe(3)
    expect(await countLocations(childId)).toBe(3)
  })

  it('posting the same point twice does not duplicate (UPSERT)', async () => {
    const { familyId, childId } = await pairChild('みさき')
    const point = { lat: 35.64, lng: 139.65, at: '2026-08-21T16:00:00+09:00' }
    for (let i = 0; i < 2; i++) {
      const res = await fetchApp('/v1/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Family-Id': familyId },
        body: JSON.stringify({ child_id: childId, points: [point] }),
      })
      expect(res.status).toBe(200)
    }
    expect(await countLocations(childId)).toBe(1)
  })

  it('response JSON has the same key shape as Phase 1', async () => {
    const { familyId, childId } = await pairChild('たろう')
    const res = await fetchApp('/v1/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Family-Id': familyId },
      body: JSON.stringify({
        child_id: childId,
        points: [{ lat: 35.6478, lng: 139.6601, at: '2026-08-21T17:00:00+09:00' }],
      }),
    })
    const body = await res.json() as any
    expect(Object.keys(body).sort()).toEqual(['accepted', 'current', 'results'].sort())
    expect(Object.keys(body.results[0]).sort()).toEqual(['at', 'factors', 'lat', 'level', 'lng', 'score'].sort())
    expect(Object.keys(body.current).sort()).toEqual(['level', 'score'].sort())
    expect(typeof body.results[0].score).toBe('number')
    expect(['safe', 'caution', 'danger']).toContain(body.results[0].level)
    expect(Array.isArray(body.results[0].factors)).toBe(true)
  })

  it('GET /v1/grid and /v1/score still work through the scoring module', async () => {
    const gridRes = await fetchApp('/v1/grid?bbox=139.65,35.64,139.66,35.65')
    expect(gridRes.status).toBe(200)
    const gridBody = await gridRes.json() as { cells: any[] }
    expect(gridBody.cells.length).toBeGreaterThan(0)

    const scoreRes = await fetchApp('/v1/score?lat=35.6478&lng=139.6601')
    expect(scoreRes.status).toBe(200)
    const scoreBody = await scoreRes.json() as any
    expect(Object.keys(scoreBody).sort()).toEqual(
      ['at', 'factors', 'lat', 'level', 'lng', 'nearest_refuge', 'reason', 'score', 'title'].sort()
    )
  })
})
