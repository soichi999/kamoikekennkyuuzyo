import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:test'
import worker from '../src/index'

async function fetchApp(path: string, init?: RequestInit) {
  const req = new Request(`https://example.com${path}`, init)
  return worker.fetch(req, env as any, { waitUntil: () => {}, passThroughOnException: () => {} } as any)
}

async function createAndRedeem(childName = 'はると') {
  const createRes = await fetchApp('/v1/pairing/create', { method: 'POST' })
  const created = await createRes.json() as { code: string; family_id: string }

  const redeemRes = await fetchApp('/v1/pairing/redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: created.code, child_name: childName }),
  })
  const redeemed = await redeemRes.json() as { family_id: string; child_id: string; name: string; paired_at: string }
  return { created, redeemRes, redeemed }
}

describe('Phase 2: pairing + auth', () => {
  it('create -> redeem -> children list works end to end', async () => {
    const { created, redeemRes, redeemed } = await createAndRedeem('はると')

    expect(redeemRes.status).toBe(200)
    expect(redeemed.family_id).toBe(created.family_id)
    expect(redeemed.child_id).toMatch(/^chd_/)
    expect(redeemed.name).toBe('はると')

    const listRes = await fetchApp(`/v1/family/${created.family_id}/children`, {
      headers: { 'X-Family-Id': created.family_id },
    })
    expect(listRes.status).toBe(200)
    const listBody = await listRes.json() as { children: { child_id: string; name: string }[] }
    expect(listBody.children.some(c => c.child_id === redeemed.child_id && c.name === 'はると')).toBe(true)
  })

  it('redeeming a nonexistent code returns 404 CODE_NOT_FOUND', async () => {
    const res = await fetchApp('/v1/pairing/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '999999', child_name: 'x' }),
    })
    expect(res.status).toBe(404)
    const body = await res.json() as { error: { code: string } }
    expect(body.error.code).toBe('CODE_NOT_FOUND')
  })

  it('redeeming the same code twice fails the second time', async () => {
    const createRes = await fetchApp('/v1/pairing/create', { method: 'POST' })
    const created = await createRes.json() as { code: string }

    const first = await fetchApp('/v1/pairing/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: created.code, child_name: 'a' }),
    })
    expect(first.status).toBe(200)

    const second = await fetchApp('/v1/pairing/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: created.code, child_name: 'b' }),
    })
    expect(second.status).toBe(404)
    const body = await second.json() as { error: { code: string } }
    expect(body.error.code).toBe('CODE_NOT_FOUND')
  })

  it('missing X-Family-Id header returns 401 UNAUTHORIZED', async () => {
    const res = await fetchApp('/v1/family/fam_whatever/children')
    expect(res.status).toBe(401)
    const body = await res.json() as { error: { code: string } }
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('accessing another family\'s children returns 403 FORBIDDEN', async () => {
    const { created } = await createAndRedeem('はると')
    const res = await fetchApp(`/v1/family/${created.family_id}/children`, {
      headers: { 'X-Family-Id': 'fam_someoneelse' },
    })
    expect(res.status).toBe(403)
    const body = await res.json() as { error: { code: string } }
    expect(body.error.code).toBe('FORBIDDEN')
  })

  it('POST /v1/locations for a child in another family returns 403 FORBIDDEN', async () => {
    const { created, redeemed } = await createAndRedeem('みさき')
    const res = await fetchApp('/v1/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Family-Id': 'fam_someoneelse' },
      body: JSON.stringify({ child_id: redeemed.child_id, points: [{ lat: 35.6, lng: 139.6 }] }),
    })
    expect(res.status).toBe(403)
    const body = await res.json() as { error: { code: string } }
    expect(body.error.code).toBe('FORBIDDEN')
    // sanity: own family can post
    const ok = await fetchApp('/v1/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Family-Id': created.family_id },
      body: JSON.stringify({ child_id: redeemed.child_id, points: [{ lat: 35.6, lng: 139.6 }] }),
    })
    expect(ok.status).toBe(200)
  })

  it('POST /v1/locations without X-Family-Id returns 401 UNAUTHORIZED', async () => {
    const res = await fetchApp('/v1/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ child_id: 'chd_x', points: [] }),
    })
    expect(res.status).toBe(401)
  })
})
