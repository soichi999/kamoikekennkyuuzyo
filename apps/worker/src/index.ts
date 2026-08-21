import { Hono, Context } from 'hono'
import { cors } from 'hono/cors'
import {
  jstNow, toJSTString, toJSTDateString, parseJST,
  randomString, randomDigits,
  levelFromScore,
  type Factor, type RiskLevel, type LocationPoint, type LocationResult, type GridCell, type TrackPoint, type Refuge,
} from './score.js'
import type { Env, Variables } from './types.js'
import { requireFamilyAuth, forbidden } from './auth.js'
import { createPairing, redeemPairing, listChildren, getChildFamilyId } from './pairing.js'
import { saveLocations } from './locations.js'
import { scorePoint, scoreGrid, nearestRefuge } from './scoring/index.js'
import { fetchDaily, fetchTrack, fetchDailyRange, type DailyRow } from './aggregation/repository.js'
import type { Hotspot, DailyStats } from './aggregation/types.js'
import { aggregateDailyWithSummary, runDailyAggregationForDate } from './aggregation/runDaily.js'
import { checkRateLimit } from './rateLimit.js'

interface PairingCreateResponse {
  code: string
  family_id: string
  expires_at: string
  qr_payload: string
}

interface PairingRedeemRequest {
  code?: string
  child_name?: string
}

interface PairingRedeemResponse {
  family_id: string
  child_id: string
  name: string
  paired_at: string
}

interface Child {
  child_id: string
  name: string
  grade: string
  home: { lat: number; lng: number }
  school: { lat: number; lng: number }
  paired_at: string
}

interface LocationsRequest {
  child_id?: string
  points?: LocationPoint[]
}

interface LocationsResponse {
  accepted: number
  results: LocationResult[]
  current: { score: number; level: RiskLevel } | null
}

interface GridResponse {
  cell_size_m: number
  at: string
  count: number
  cells: GridCell[]
}

interface ScoreResponse {
  lat: number
  lng: number
  at: string
  score: number
  level: RiskLevel
  factors: Factor[]
  title: string
  reason: string
  nearest_refuge: Refuge[]
}

interface DailySummary {
  format: 'markdown'
  for_parent: string
  for_child: string
  talking_points: string[]
  generated_at: string
  model: string
}

interface DailyReadyResponse {
  child_id: string
  date: string
  status: 'ready'
  total_score: number
  level: RiskLevel
  baseline_score: number | null
  diff_from_baseline: number | null
  track: TrackPoint[]
  hotspots: Hotspot[]
  summary: DailySummary | null
  stats: DailyStats
}

interface DailyNoDataResponse {
  child_id: string
  date: string
  status: 'no_data'
  message: string
}

interface DailyPendingResponse {
  status: 'pending'
  message: string
}

interface WeeklyDay {
  date: string
  total_score: number | null
  level: RiskLevel | null
  has_hotspot: boolean
}

interface WeeklyResponse {
  child_id: string
  end: string
  days: WeeklyDay[]
  average: number | null
  baseline_score: number | null
}

interface ErrorBody {
  error: {
    code: string
    message: string
  }
}

interface HealthResponse {
  app: string
  version: string
  phase: string
  endpoints: string[]
  scoring_impl: string
  ai_provider: string
}

function queryParam(c: Context<{ Bindings: Env; Variables: Variables }>, key: string): string | undefined {
  const val = c.req.query(key)
  if (val == null) return undefined
  return val.replace(/ /g, '+')
}

const app = new Hono<{ Bindings: Env; Variables: Variables }>()

app.use('/v1/family/*', requireFamilyAuth)
app.use('/v1/children/*', requireFamilyAuth)
app.use('/v1/locations', requireFamilyAuth)

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}))

const endpoints = [
  'POST /v1/pairing/create',
  'POST /v1/pairing/redeem',
  'GET /v1/family/{family_id}/children',
  'POST /v1/locations',
  'GET /v1/grid?bbox=&zoom=&at=',
  'GET /v1/score?lat=&lng=&at=',
  'GET /v1/children/{child_id}/daily?date=',
  'GET /v1/children/{child_id}/weekly?end=',
]

function buildHealthBody(c: Context<{ Bindings: Env; Variables: Variables }>): HealthResponse {
  return {
    app: 'カケコミ API',
    version: '1.0.0',
    phase: '2-6 (D1/KV/Cron/AI)',
    endpoints,
    scoring_impl: c.env.SCORING_IMPL || 'mock',
    ai_provider: c.env.AI_PROVIDER || 'template',
  }
}

app.get('/', (c) => c.json(buildHealthBody(c)))

app.get('/v1', (c) => c.json(buildHealthBody(c)))

app.post('/v1/pairing/create', async (c) => {
  const { code, familyId, expiresAt } = await createPairing(c.env)
  const body: PairingCreateResponse = {
    code,
    family_id: familyId,
    expires_at: toJSTString(expiresAt),
    qr_payload: `kakekomi://pair?code=${code}`,
  }
  return c.json(body)
})

app.post('/v1/pairing/redeem', async (c) => {
  let body: PairingRedeemRequest
  try { body = await c.req.json() } catch { body = {} }
  const code = body.code
  if (!code || code === '') {
    return c.json({ error: { code: 'MISSING_CODE', message: 'codeは必須です' } } satisfies ErrorBody, 400 as const)
  }
  const result = await redeemPairing(c.env, code, body.child_name)
  if (!result.ok) {
    return c.json({ error: { code: 'CODE_NOT_FOUND', message: '指定されたコードが見つかりません' } } satisfies ErrorBody, 404 as const)
  }
  const res: PairingRedeemResponse = {
    family_id: result.familyId,
    child_id: result.childId,
    name: result.name,
    paired_at: toJSTString(result.pairedAt),
  }
  return c.json(res)
})

app.get('/v1/family/:family_id/children', async (c) => {
  const familyId = c.req.param('family_id')
  if (familyId !== c.get('familyId')) {
    return forbidden(c)
  }
  const rows = await listChildren(c.env, familyId)
  const children: Child[] = rows.map(r => ({
    child_id: r.child_id,
    name: r.name,
    grade: r.grade,
    home: { lat: r.home_lat, lng: r.home_lng },
    school: { lat: r.school_lat, lng: r.school_lng },
    paired_at: r.created_at,
  }))
  return c.json({ children })
})

app.post('/v1/locations', async (c) => {
  let body: LocationsRequest
  try { body = await c.req.json() } catch { body = {} }
  if (!body.child_id || body.child_id === '') {
    return c.json({ error: { code: 'MISSING_CHILD_ID', message: 'child_idは必須です' } } satisfies ErrorBody, 400 as const)
  }
  if (!body.points || !Array.isArray(body.points)) {
    return c.json({ error: { code: 'MISSING_POINTS', message: 'pointsは必須です（配列）' } } satisfies ErrorBody, 400 as const)
  }
  if (body.points.length > 500) {
    return c.json({ error: { code: 'TOO_MANY_POINTS', message: 'pointsは最大500件までです' } } satisfies ErrorBody, 400 as const)
  }
  const ownerFamilyId = await getChildFamilyId(c.env, body.child_id)
  if (ownerFamilyId === null || ownerFamilyId !== c.get('familyId')) {
    return forbidden(c)
  }
  const withinRateLimit = await checkRateLimit(c.env, `locations:${body.child_id}`)
  if (!withinRateLimit) {
    return c.json({ error: { code: 'RATE_LIMITED', message: 'リクエストが多すぎます。しばらく待ってから再試行してください' } } satisfies ErrorBody, 429 as const)
  }
  const results: LocationResult[] = body.points.map(p => {
    const at = p.at || toJSTString(jstNow())
    const { score, level, factors } = scorePoint({ lat: p.lat, lng: p.lng, at }, c.env.SCORING_IMPL)
    return { lat: p.lat, lng: p.lng, at, score, level, factors }
  })
  await saveLocations(c.env, body.child_id, results)
  let current: { score: number; level: RiskLevel } | null = null
  if (results.length > 0) {
    let maxScore = -1
    for (const r of results) {
      if (r.score > maxScore) { maxScore = r.score; current = { score: r.score, level: r.level } }
    }
  }
  return c.json({
    accepted: results.length,
    results,
    current,
  } satisfies LocationsResponse)
})

app.get('/v1/score', (c) => {
  const latStr = queryParam(c, 'lat')
  const lngStr = queryParam(c, 'lng')
  if (!latStr || !lngStr) {
    return c.json({ error: { code: 'MISSING_LATLNG', message: 'lat と lng は必須です' } } satisfies ErrorBody, 400 as const)
  }
  const lat = parseFloat(latStr)
  const lng = parseFloat(lngStr)
  const atStr = queryParam(c, 'at') || toJSTString(jstNow())
  const { score, level, factors } = scorePoint({ lat, lng, at: atStr }, c.env.SCORING_IMPL)
  const res: ScoreResponse = {
    lat, lng, at: atStr, score, level,
    factors,
    title: 'この地点',
    reason: '周辺の平均的な水準です',
    nearest_refuge: nearestRefuge({ lat, lng, at: atStr }, c.env.SCORING_IMPL),
  }
  return c.json(res)
})

app.get('/v1/grid', (c) => {
  const bboxStr = queryParam(c, 'bbox')
  if (!bboxStr) {
    return c.json({ error: { code: 'MISSING_BBOX', message: 'bboxパラメータは必須です' } } satisfies ErrorBody, 400 as const)
  }
  const parts = bboxStr.split(',').map(parseFloat)
  if (parts.length !== 4 || parts.some(isNaN)) {
    return c.json({ error: { code: 'INVALID_BBOX', message: 'bboxは minLng,minLat,maxLng,maxLat の4つの数値が必要です' } } satisfies ErrorBody, 400 as const)
  }
  const [minLng, minLat, maxLng, maxLat] = parts as [number, number, number, number]
  if (minLat >= maxLat || minLng >= maxLng) {
    return c.json({ error: { code: 'INVALID_BBOX', message: 'bboxの値が不正です（min < max にしてください）' } } satisfies ErrorBody, 400 as const)
  }
  const atStr = queryParam(c, 'at') || toJSTString(jstNow())
  const zoomStr = queryParam(c, 'zoom')
  const cells: GridCell[] = scoreGrid({
    bbox: [minLng, minLat, maxLng, maxLat],
    zoom: zoomStr ? parseFloat(zoomStr) : undefined,
    at: atStr,
  }, c.env.SCORING_IMPL)
  return c.json({
    cell_size_m: 100,
    at: atStr,
    count: cells.length,
    cells,
  } satisfies GridResponse)
})

app.get('/v1/children/:child_id/daily', async (c) => {
  const childId = c.req.param('child_id')
  const ownerFamilyId = await getChildFamilyId(c.env, childId)
  if (ownerFamilyId === null || ownerFamilyId !== c.get('familyId')) {
    return forbidden(c)
  }
  const dateStr = queryParam(c, 'date') || toJSTDateString(jstNow())

  const row = await fetchDaily(c.env, childId, dateStr)
  if (!row) {
    return c.json({
      status: 'pending' as const,
      message: 'この日の集計はまだ実行されていません',
    } satisfies DailyPendingResponse)
  }
  if (row.status === 'no_data') {
    return c.json({
      child_id: childId,
      date: dateStr,
      status: 'no_data' as const,
      message: 'この日は位置情報が記録されていません',
    } satisfies DailyNoDataResponse)
  }

  const track = await fetchTrack(c.env, childId, dateStr)
  const res: DailyReadyResponse = {
    child_id: childId,
    date: dateStr,
    status: 'ready',
    total_score: row.total_score as number,
    level: row.level as RiskLevel,
    baseline_score: row.baseline_score,
    diff_from_baseline: row.diff_from_baseline,
    track,
    hotspots: JSON.parse(row.hotspots as string) as Hotspot[],
    summary: row.summary ? (JSON.parse(row.summary) as DailySummary) : null,
    stats: JSON.parse(row.stats as string) as DailyStats,
  }
  return c.json(res)
})

app.get('/v1/children/:child_id/weekly', async (c) => {
  const childId = c.req.param('child_id')
  const ownerFamilyId = await getChildFamilyId(c.env, childId)
  if (ownerFamilyId === null || ownerFamilyId !== c.get('familyId')) {
    return forbidden(c)
  }
  const endStr = queryParam(c, 'end') || toJSTDateString(jstNow())
  const endParts = endStr.split('-').map(Number)
  const dates: string[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(endParts[0], endParts[1] - 1, endParts[2] - i)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    dates.push(`${y}-${m}-${day}`)
  }

  const rows = await fetchDailyRange(c.env, childId, dates[0], dates[dates.length - 1])
  const rowsByDate = new Map<string, DailyRow>(rows.map(r => [r.date, r]))

  const days: WeeklyDay[] = dates.map(ds => {
    const row = rowsByDate.get(ds)
    if (!row || row.status !== 'ready') {
      return { date: ds, total_score: null, level: null, has_hotspot: false }
    }
    const hotspots = row.hotspots ? (JSON.parse(row.hotspots) as unknown[]) : []
    return {
      date: ds,
      total_score: row.total_score,
      level: row.level as RiskLevel,
      has_hotspot: hotspots.length > 0,
    }
  })

  const validScores = days.map(d => d.total_score).filter((s): s is number => s !== null)
  const average = validScores.length > 0
    ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
    : null

  const endRow = rowsByDate.get(endStr)
  const baselineScore = endRow && endRow.status === 'ready' ? endRow.baseline_score : null

  return c.json({
    child_id: childId,
    end: endStr,
    days,
    average,
    baseline_score: baselineScore,
  } satisfies WeeklyResponse)
})

interface AdminAggregateRequest {
  child_id?: string
  date?: string
}

app.post('/v1/admin/aggregate', async (c) => {
  const authHeader = c.req.header('Authorization')
  const token = authHeader?.replace(/^Bearer\s+/i, '')
  if (!c.env.ADMIN_TOKEN || token !== c.env.ADMIN_TOKEN) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: '管理者認証が必要です' } } satisfies ErrorBody, 401 as const)
  }
  let body: AdminAggregateRequest
  try { body = await c.req.json() } catch { body = {} }
  if (!body.child_id || !body.date) {
    return c.json({ error: { code: 'MISSING_PARAMS', message: 'child_id と date は必須です' } } satisfies ErrorBody, 400 as const)
  }
  await aggregateDailyWithSummary(c.env, body.child_id, body.date)
  return c.json({ ok: true, child_id: body.child_id, date: body.date })
})

app.notFound((c) => c.json({
  error: { code: 'NOT_FOUND', message: `パス ${c.req.path} は存在しません` },
} satisfies ErrorBody, 404 as const))

async function scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
  const today = toJSTDateString(jstNow())
  ctx.waitUntil(runDailyAggregationForDate(env, today))
}

export default {
  fetch: app.fetch,
  scheduled,
}