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

describe('Phase 6: health check', () => {
  it('GET / reports current SCORING_IMPL and AI_PROVIDER', async () => {
    const res = await fetchApp('/')
    const body = await res.json() as any
    expect(body.scoring_impl).toBe('mock')
    expect(body.ai_provider).toBe('template')
  })
})

describe('Phase 6: rate limiting', () => {
  it('rejects the 61st /v1/locations request within a minute with 429 RATE_LIMITED', async () => {
    const { familyId, childId } = await pairChild('ratelimit-test')
    let lastStatus = 0
    let lastBody: any = null
    for (let i = 0; i < 61; i++) {
      const res = await fetchApp('/v1/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Family-Id': familyId },
        body: JSON.stringify({ child_id: childId, points: [{ lat: 35.64, lng: 139.65, at: `2026-08-21T15:${String(i).padStart(2, '0')}:00+09:00` }] }),
      })
      lastStatus = res.status
      lastBody = await res.json()
    }
    expect(lastStatus).toBe(429)
    expect(lastBody.error.code).toBe('RATE_LIMITED')
  })
})

describe('Phase 6: unified error shape', () => {
  it('every tested error response has the {error:{code,message}} shape', async () => {
    const cases: [string, RequestInit?][] = [
      ['/v1/nonexistent-path', undefined],
      ['/v1/pairing/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }],
      ['/v1/score', undefined],
      ['/v1/grid', undefined],
      ['/v1/family/fam_x/children', undefined],
    ]
    for (const [path, init] of cases) {
      const res = await fetchApp(path, init)
      expect(res.status).toBeGreaterThanOrEqual(400)
      const body = await res.json() as any
      expect(body.error).toBeDefined()
      expect(typeof body.error.code).toBe('string')
      expect(typeof body.error.message).toBe('string')
    }
  })
})

describe('Phase 6: full smoke test through every endpoint', () => {
  it('walks the whole flow: pairing -> children -> locations -> grid -> score -> admin aggregate -> daily -> weekly', async () => {
    // health
    expect((await fetchApp('/')).status).toBe(200)

    // pairing
    const createRes = await fetchApp('/v1/pairing/create', { method: 'POST' })
    expect(createRes.status).toBe(200)
    const created = await createRes.json() as { code: string; family_id: string }

    const redeemRes = await fetchApp('/v1/pairing/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: created.code, child_name: 'スモークテスト' }),
    })
    expect(redeemRes.status).toBe(200)
    const redeemed = await redeemRes.json() as { child_id: string }

    // children list
    const childrenRes = await fetchApp(`/v1/family/${created.family_id}/children`, {
      headers: { 'X-Family-Id': created.family_id },
    })
    expect(childrenRes.status).toBe(200)

    // locations
    const date = '2026-08-21'
    const locRes = await fetchApp('/v1/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Family-Id': created.family_id },
      body: JSON.stringify({
        child_id: redeemed.child_id,
        points: [
          { lat: 35.6478, lng: 139.6601, at: `${date}T15:00:00+09:00` },
          { lat: 35.6470, lng: 139.6590, at: `${date}T15:10:00+09:00` },
        ],
      }),
    })
    expect(locRes.status).toBe(200)

    // grid / score (no auth required)
    expect((await fetchApp('/v1/grid?bbox=139.65,35.64,139.66,35.65')).status).toBe(200)
    expect((await fetchApp('/v1/score?lat=35.6478&lng=139.6601')).status).toBe(200)

    // admin aggregate
    const aggRes = await fetchApp('/v1/admin/aggregate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-admin-token' },
      body: JSON.stringify({ child_id: redeemed.child_id, date }),
    })
    expect(aggRes.status).toBe(200)

    // daily / weekly
    const dailyRes = await fetchApp(`/v1/children/${redeemed.child_id}/daily?date=${date}`, {
      headers: { 'X-Family-Id': created.family_id },
    })
    expect(dailyRes.status).toBe(200)
    const dailyBody = await dailyRes.json() as any
    expect(dailyBody.status).toBe('ready')

    const weeklyRes = await fetchApp(`/v1/children/${redeemed.child_id}/weekly?end=${date}`, {
      headers: { 'X-Family-Id': created.family_id },
    })
    expect(weeklyRes.status).toBe(200)
    const weeklyBody = await weeklyRes.json() as any
    expect(weeklyBody.days.length).toBe(7)
  })
})
