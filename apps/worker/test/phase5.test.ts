import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:test'
import worker from '../src/index'
import { jstNow, toJSTDateString, type Factor } from '../src/score'

async function fetchApp(path: string, init?: RequestInit, envOverrides: Record<string, unknown> = {}) {
  const req = new Request(`https://example.com${path}`, init)
  const mergedEnv = { ...(env as any), ...envOverrides }
  return worker.fetch(req, mergedEnv, { waitUntil: () => {}, passThroughOnException: () => {} } as any)
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

const dangerFactors: Factor[] = [{ key: 'refuge', label: '駆け込み先', impact: 20, detail: '半径300m内に0件' }]

async function insertRawLocation(childId: string, at: string, score: number, level: 'safe' | 'caution' | 'danger', factors: Factor[]) {
  await env.DB.prepare(
    `INSERT INTO location (child_id, lat, lng, at, score, level, factors, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(childId, 35.64, 139.65, at, score, level, JSON.stringify(factors), at).run()
}

async function fetchDailyRow(childId: string, date: string) {
  return env.DB.prepare('SELECT * FROM daily WHERE child_id = ? AND date = ?').bind(childId, date).first<any>()
}

describe('Phase 5: admin aggregate + AI summary', () => {
  it('rejects without a valid ADMIN_TOKEN', async () => {
    const { childId } = await pairChild('a')
    const res = await fetchApp('/v1/admin/aggregate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ child_id: childId, date: '2026-08-21' }),
    })
    expect(res.status).toBe(401)
  })

  it('AI_PROVIDER=template produces a populated summary via /v1/admin/aggregate', async () => {
    const { childId } = await pairChild('b')
    const date = '2026-08-21'
    await insertRawLocation(childId, `${date}T15:00:00+09:00`, 80, 'danger', dangerFactors)

    const res = await fetchApp('/v1/admin/aggregate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-admin-token' },
      body: JSON.stringify({ child_id: childId, date }),
    }, { AI_PROVIDER: 'template' })
    expect(res.status).toBe(200)

    const row = await fetchDailyRow(childId, date)
    expect(row.status).toBe('ready')
    const summary = JSON.parse(row.summary)
    expect(summary.format).toBe('markdown')
    expect(typeof summary.for_parent).toBe('string')
    expect(typeof summary.for_child).toBe('string')
    expect(Array.isArray(summary.talking_points)).toBe(true)
    expect(summary.model).toBe('template')
  })

  it('falls back to template when the AI returns invalid JSON', async () => {
    const { childId } = await pairChild('c')
    const date = '2026-08-21'
    await insertRawLocation(childId, `${date}T15:00:00+09:00`, 80, 'danger', dangerFactors)

    const fakeAi = { run: async () => ({ response: 'this is not json at all' }) }
    const res = await fetchApp('/v1/admin/aggregate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-admin-token' },
      body: JSON.stringify({ child_id: childId, date }),
    }, { AI_PROVIDER: 'workers-ai', AI: fakeAi })
    expect(res.status).toBe(200)

    const row = await fetchDailyRow(childId, date)
    expect(row.status).toBe('ready')
    const summary = JSON.parse(row.summary)
    expect(summary.model).toBe('template') // フォールバック
  })

  it('aggregation still succeeds (status: ready) even if the AI call throws', async () => {
    const { childId } = await pairChild('d')
    const date = '2026-08-21'
    await insertRawLocation(childId, `${date}T15:00:00+09:00`, 30, 'safe', [])

    const throwingAi = { run: async () => { throw new Error('boom') } }
    const res = await fetchApp('/v1/admin/aggregate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-admin-token' },
      body: JSON.stringify({ child_id: childId, date }),
    }, { AI_PROVIDER: 'workers-ai', AI: throwingAi })
    expect(res.status).toBe(200)

    const row = await fetchDailyRow(childId, date)
    expect(row.status).toBe('ready')
  })
})

describe('Phase 5: scheduled (Cron) handler', () => {
  it('processes multiple children that have location data for today', async () => {
    const { childId: childA } = await pairChild('e')
    const { childId: childB } = await pairChild('f')
    const today = toJSTDateString(jstNow())

    await insertRawLocation(childA, `${today}T15:00:00+09:00`, 40, 'caution', [])
    await insertRawLocation(childB, `${today}T15:00:00+09:00`, 80, 'danger', dangerFactors)

    const collected: Promise<unknown>[] = []
    const ctx = {
      waitUntil: (p: Promise<unknown>) => { collected.push(p) },
      passThroughOnException: () => {},
    }
    await (worker as any).scheduled({ cron: '0 13 * * *', scheduledTime: Date.now() }, env, ctx)
    await Promise.all(collected)

    const rowA = await fetchDailyRow(childA, today)
    const rowB = await fetchDailyRow(childB, today)
    expect(rowA.status).toBe('ready')
    expect(rowB.status).toBe('ready')
  })
})
