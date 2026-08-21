import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:test'
import worker from '../src/index'
import { aggregateDaily } from '../src/aggregation/daily'
import type { Factor } from '../src/score'

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

interface RawPoint {
  lat: number
  lng: number
  at: string
  score: number
  level: 'safe' | 'caution' | 'danger'
  factors: Factor[]
}

async function insertRawLocations(childId: string, points: RawPoint[]) {
  const stmt = env.DB.prepare(
    `INSERT INTO location (child_id, lat, lng, at, score, level, factors, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  await env.DB.batch(points.map(p =>
    stmt.bind(childId, p.lat, p.lng, p.at, p.score, p.level, JSON.stringify(p.factors), p.at)
  ))
}

const refugeFactor: Factor[] = [{ key: 'refuge', label: '駆け込み先', impact: 20, detail: '半径300m内に0件' }]
const trafficFactor: Factor[] = [{ key: 'traffic', label: '交通事故', impact: 10, detail: '周辺で直近期1件の事故' }]

describe('Phase 4: aggregation engine', () => {
  it('nearby danger points (within 5min/200m) merge into one hotspot; a far one stays separate; no-danger day has zero hotspots', async () => {
    const { childId } = await pairChild('a')
    const date = '2026-08-21'
    await insertRawLocations(childId, [
      // 2つの近接 danger 点 -> 1つのホットスポットにまとまる
      { lat: 35.6478, lng: 139.6601, at: `${date}T15:00:00+09:00`, score: 70, level: 'danger', factors: refugeFactor },
      { lat: 35.64785, lng: 139.66015, at: `${date}T15:03:00+09:00`, score: 75, level: 'danger', factors: refugeFactor },
      // 離れた(30分後・遠方) danger 点 -> 別ホットスポット
      { lat: 35.6300, lng: 139.6400, at: `${date}T15:40:00+09:00`, score: 80, level: 'danger', factors: trafficFactor },
      // 安全な点
      { lat: 35.6420, lng: 139.6530, at: `${date}T16:00:00+09:00`, score: 20, level: 'safe', factors: [] },
    ])

    await aggregateDaily(env as any, childId, date)

    const row = await env.DB.prepare('SELECT * FROM daily WHERE child_id = ? AND date = ?')
      .bind(childId, date).first<any>()
    expect(row.status).toBe('ready')
    const hotspots = JSON.parse(row.hotspots)
    expect(hotspots.length).toBe(2)
    expect(hotspots[0].score).toBe(75) // マージされたクラスタの最大値
    expect(hotspots[1].score).toBe(80)
  })

  it('a day with no danger points has zero hotspots', async () => {
    const { childId } = await pairChild('b')
    const date = '2026-08-21'
    await insertRawLocations(childId, [
      { lat: 35.64, lng: 139.65, at: `${date}T15:00:00+09:00`, score: 30, level: 'safe', factors: [] },
      { lat: 35.641, lng: 139.651, at: `${date}T15:10:00+09:00`, score: 50, level: 'caution', factors: [] },
    ])
    await aggregateDaily(env as any, childId, date)
    const row = await env.DB.prepare('SELECT * FROM daily WHERE child_id = ? AND date = ?')
      .bind(childId, date).first<any>()
    expect(JSON.parse(row.hotspots)).toEqual([])
  })

  it('total_score matches a hand-computed value and weighs longer stays more heavily', async () => {
    const { childId } = await pairChild('c')
    const date = '2026-08-21'
    // 2点: score=80 (10分滞在=次の点との差), score=40 (最後の点なので直前の差=20分を流用)
    await insertRawLocations(childId, [
      { lat: 35.64, lng: 139.65, at: `${date}T15:00:00+09:00`, score: 80, level: 'danger', factors: refugeFactor },
      { lat: 35.6410, lng: 139.6510, at: `${date}T15:10:00+09:00`, score: 40, level: 'caution', factors: [] },
      { lat: 35.6420, lng: 139.6520, at: `${date}T15:30:00+09:00`, score: 40, level: 'caution', factors: [] },
    ])
    // duration: [10, 20, 20] (最後は直前の差を流用)
    // weighted_avg = (80*10 + 40*20 + 40*20) / 50 = (800+800+800)/50 = 48
    // hotspot: 80点1件のみ(単独クラスタ) -> penalty = min(15, 1*5) = 5
    // total = min(100, round(48+5)) = 53
    await aggregateDaily(env as any, childId, date)
    const row = await env.DB.prepare('SELECT * FROM daily WHERE child_id = ? AND date = ?')
      .bind(childId, date).first<any>()
    expect(row.total_score).toBe(53)
  })

  it('baseline is null with 6 days of history and becomes a number with 7 days', async () => {
    const { childId } = await pairChild('d')
    const scores = [30, 40, 50, 60, 35, 45] // 6 days
    for (let i = 0; i < scores.length; i++) {
      const d = `2026-08-${String(10 + i).padStart(2, '0')}`
      await env.DB.prepare(
        `INSERT INTO daily (child_id, date, status, total_score, level, baseline_score, diff_from_baseline, hotspots, summary, stats, generated_at)
         VALUES (?, ?, 'ready', ?, 'caution', NULL, NULL, '[]', NULL, '{}', ?)`
      ).bind(childId, d, scores[i], d).run()
    }
    await insertRawLocations(childId, [
      { lat: 35.64, lng: 139.65, at: '2026-08-20T15:00:00+09:00', score: 40, level: 'caution', factors: [] },
    ])
    await aggregateDaily(env as any, childId, '2026-08-20')
    let row = await env.DB.prepare('SELECT baseline_score FROM daily WHERE child_id = ? AND date = ?')
      .bind(childId, '2026-08-20').first<any>()
    expect(row.baseline_score).toBeNull()

    // 7日目を追加
    await env.DB.prepare(
      `INSERT INTO daily (child_id, date, status, total_score, level, baseline_score, diff_from_baseline, hotspots, summary, stats, generated_at)
       VALUES (?, '2026-08-16', 'ready', 55, 'caution', NULL, NULL, '[]', NULL, '{}', '2026-08-16')`
    ).bind(childId).run()
    await aggregateDaily(env as any, childId, '2026-08-20')
    row = await env.DB.prepare('SELECT baseline_score FROM daily WHERE child_id = ? AND date = ?')
      .bind(childId, '2026-08-20').first<any>()
    expect(row.baseline_score).not.toBeNull()
    expect(typeof row.baseline_score).toBe('number')
  })
})

describe('Phase 4: daily / weekly read APIs', () => {
  it('GET daily returns pending for a row that has not been aggregated yet, no_data for an empty day, and ready with real data otherwise', async () => {
    const { familyId, childId } = await pairChild('e')
    const pendingRes = await fetchApp(`/v1/children/${childId}/daily?date=2099-01-01`, {
      headers: { 'X-Family-Id': familyId },
    })
    const pendingBody = await pendingRes.json() as any
    expect(pendingBody.status).toBe('pending')

    await aggregateDaily(env as any, childId, '2026-08-21') // 0件 -> no_data
    const noDataRes = await fetchApp(`/v1/children/${childId}/daily?date=2026-08-21`, {
      headers: { 'X-Family-Id': familyId },
    })
    const noDataBody = await noDataRes.json() as any
    expect(noDataBody.status).toBe('no_data')

    await insertRawLocations(childId, [
      { lat: 35.64, lng: 139.65, at: '2026-08-22T15:00:00+09:00', score: 40, level: 'caution', factors: [] },
    ])
    await aggregateDaily(env as any, childId, '2026-08-22')
    const readyRes = await fetchApp(`/v1/children/${childId}/daily?date=2026-08-22`, {
      headers: { 'X-Family-Id': familyId },
    })
    const readyBody = await readyRes.json() as any
    expect(readyBody.status).toBe('ready')
    expect(readyBody.summary).toBeNull()
    expect(Array.isArray(readyBody.track)).toBe(true)
    expect(readyBody.track.length).toBe(1)
  })

  it('weekly does not skip missing days, filling them with total_score: null', async () => {
    const { familyId, childId } = await pairChild('f')
    await insertRawLocations(childId, [
      { lat: 35.64, lng: 139.65, at: '2026-08-20T15:00:00+09:00', score: 40, level: 'caution', factors: [] },
    ])
    await aggregateDaily(env as any, childId, '2026-08-20')
    // 2026-08-14..2026-08-20 の7日間中、2026-08-20のみデータあり
    const res = await fetchApp(`/v1/children/${childId}/weekly?end=2026-08-20`, {
      headers: { 'X-Family-Id': familyId },
    })
    const body = await res.json() as any
    expect(body.days.length).toBe(7)
    expect(body.days.map((d: any) => d.date)).toEqual([
      '2026-08-14', '2026-08-15', '2026-08-16', '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20',
    ])
    const withData = body.days.filter((d: any) => d.total_score !== null)
    expect(withData.length).toBe(1)
    expect(withData[0].date).toBe('2026-08-20')
  })
})
