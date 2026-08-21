import { Hono, Context } from 'hono'
import { cors } from 'hono/cors'
import {
  jstNow, toJSTString, parseJST,
  randomString, randomDigits,
  calculateScore, levelFromScore, buildFactors, nearestRefuges,
  type Factor, type RiskLevel, type LocationPoint, type LocationResult, type GridCell, type TrackPoint, type Refuge,
} from './score.js'

// Phase 2 で DB (D1) / PAIRING_KV 等のバインディングを追加予定
interface Env {}

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
  for_parent: string
  for_child: string
  talking_points: string[]
  generated_at: string
  model: string
}

interface DailyStats {
  distance_m: number
  duration_min: number
  point_count: number
  departed_at: string
  arrived_at: string
}

interface Hotspot {
  hotspot_id: string
  lat: number
  lng: number
  score: number
  level: RiskLevel
  at: string
  title: string
  reason: string
  factors: Factor[]
  stay_minutes: number
}

interface DailyReadyResponse {
  child_id: string
  date: string
  status: 'ready'
  total_score: number
  level: RiskLevel
  baseline_score: number
  diff_from_baseline: number
  track: TrackPoint[]
  hotspots: Hotspot[]
  summary: DailySummary
  stats: DailyStats
}

interface DailyPendingResponse {
  status: 'pending'
  message: string
}

interface WeeklyDay {
  date: string
  total_score: number
  level: RiskLevel
  has_hotspot: boolean
}

interface WeeklyResponse {
  child_id: string
  end: string
  days: WeeklyDay[]
  average: number
  baseline_score: number
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
}

const DUMMY_FAMILY_ID = 'fam_8f2a1c94'
const DUMMY_CHILDREN: Child[] = [
  {
    child_id: 'chd_3b7e05d1',
    name: 'はると',
    grade: '小学4年',
    home: { lat: 35.6421, lng: 139.6532 },
    school: { lat: 35.6478, lng: 139.6601 },
    paired_at: '2026-08-14T19:20:00+09:00',
  },
  {
    child_id: 'chd_9a2c18f4',
    name: 'みさき',
    grade: '小学2年',
    home: { lat: 35.6430, lng: 139.6510 },
    school: { lat: 35.6478, lng: 139.6601 },
    paired_at: '2026-08-14T19:25:00+09:00',
  },
]

function generateDailyTrack(): TrackPoint[] {
  const baseLat = 35.6478, baseLng = 139.6601
  const endLat = 35.6421, endLng = 139.6532
  const points = 8
  const track: TrackPoint[] = []
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1)
    const lat = +(baseLat + (endLat - baseLat) * t).toFixed(4)
    const lng = +(baseLng + (endLng - baseLng) * t).toFixed(4)
    const totalMin = 15 * 60 + i * 6
    const hh = String(Math.floor(totalMin / 60)).padStart(2, '0')
    const mm = String(totalMin % 60).padStart(2, '0')
    track.push({ lat, lng, at: `2026-08-20T${hh}:${mm}:00+09:00` })
  }
  return track
}

function generateDailyHotspots(): Hotspot[] {
  return [
    {
      hotspot_id: 'hs_01',
      lat: 35.6455, lng: 139.6566,
      score: 81, level: 'danger',
      at: '2026-08-20T15:45:00+09:00',
      title: '桜丘二丁目 高架下',
      reason: '駆け込み先ゼロ・見通し不良',
      factors: [
        { key: 'refuge', label: '駆け込み先', impact: 20, detail: '半径300m内に0件' },
        { key: 'lighting', label: '街灯', impact: 12, detail: '街灯が少ない区間' },
      ],
      stay_minutes: 6,
    },
    {
      hotspot_id: 'hs_02',
      lat: 35.6440, lng: 139.6548,
      score: 72, level: 'danger',
      at: '2026-08-20T15:55:00+09:00',
      title: '桜丘一丁目 裏道',
      reason: '交通量が多く歩道が狭い',
      factors: [
        { key: 'traffic', label: '交通事故', impact: 15, detail: '周辺で直近期2件の事故' },
        { key: 'refuge', label: '駆け込み先', impact: 8, detail: '半径300m内に1件' },
      ],
      stay_minutes: 4,
    },
    {
      hotspot_id: 'hs_03',
      lat: 35.6430, lng: 139.6538,
      score: 52, level: 'caution',
      at: '2026-08-20T16:05:00+09:00',
      title: '桜丘公園 横断歩道',
      reason: '信号なし横断歩道・夕方の通過',
      factors: [
        { key: 'traffic', label: '交通事故', impact: 10, detail: '周辺で直近期1件の事故' },
      ],
      stay_minutes: 3,
    },
  ]
}

function queryParam(c: Context<{ Bindings: Env }>, key: string): string | undefined {
  const val = c.req.query(key)
  if (val == null) return undefined
  return val.replace(/ /g, '+')
}

const app = new Hono<{ Bindings: Env }>()

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

const healthBody: HealthResponse = {
  app: 'カケコミ API',
  version: '1.0.0',
  phase: '1 (mock)',
  endpoints,
}

app.get('/', (c) => c.json(healthBody))

app.get('/v1', (c) => c.json(healthBody))

app.post('/v1/pairing/create', async (c) => {
  const now = jstNow()
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000)
  const code = randomDigits(6)
  const familyId = 'fam_' + randomString(8)
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
  if (code === '000000') {
    return c.json({ error: { code: 'CODE_NOT_FOUND', message: '指定されたコードが見つかりません' } } satisfies ErrorBody, 404 as const)
  }
  const now = jstNow()
  const childId = 'chd_' + randomString(8)
  const res: PairingRedeemResponse = {
    family_id: DUMMY_FAMILY_ID,
    child_id: childId,
    name: body.child_name || '名無し',
    paired_at: toJSTString(now),
  }
  return c.json(res)
})

app.get('/v1/family/:family_id/children', (c) => c.json({ children: DUMMY_CHILDREN }))

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
  const results: LocationResult[] = body.points.map(p => {
    const score = calculateScore(p.lat, p.lng, p.at || toJSTString(jstNow()))
    return {
      lat: p.lat,
      lng: p.lng,
      at: p.at || toJSTString(jstNow()),
      score,
      level: levelFromScore(score),
      factors: buildFactors(p.lat, p.lng, p.at || toJSTString(jstNow())),
    }
  })
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
  const score = calculateScore(lat, lng, atStr)
  const level = levelFromScore(score)
  const res: ScoreResponse = {
    lat, lng, at: atStr, score, level,
    factors: buildFactors(lat, lng, atStr),
    title: 'この地点',
    reason: '周辺の平均的な水準です',
    nearest_refuge: nearestRefuges(lat, lng),
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
  const [minLng, minLat, maxLng, maxLat] = parts
  if (minLat >= maxLat || minLng >= maxLng) {
    return c.json({ error: { code: 'INVALID_BBOX', message: 'bboxの値が不正です（min < max にしてください）' } } satisfies ErrorBody, 400 as const)
  }
  const atStr = queryParam(c, 'at') || toJSTString(jstNow())
  const cellSize = 0.0009
  const cells: GridCell[] = []
  const maxCells = 2000
  for (let lat = minLat; lat < maxLat && cells.length < maxCells; lat += cellSize) {
    for (let lng = minLng; lng < maxLng && cells.length < maxCells; lng += cellSize) {
      const score = calculateScore(lat, lng, atStr)
      cells.push({ lat: +lat.toFixed(4), lng: +lng.toFixed(4), score, level: levelFromScore(score) })
    }
  }
  return c.json({
    cell_size_m: 100,
    at: atStr,
    count: cells.length,
    cells,
  } satisfies GridResponse)
})

app.get('/v1/children/:child_id/daily', (c) => {
  const childId = c.req.param('child_id')
  const dateStr = queryParam(c, 'date') || '2026-08-20'
  const today = '2026-08-20'
  if (dateStr > today) {
    return c.json({
      status: 'pending' as const,
      message: 'この日の集計はまだ実行されていません',
    } satisfies DailyPendingResponse)
  }
  return c.json({
    child_id: childId,
    date: dateStr,
    status: 'ready' as const,
    total_score: 64,
    level: 'caution' as const,
    baseline_score: 39,
    diff_from_baseline: 25,
    track: generateDailyTrack(),
    hotspots: generateDailyHotspots(),
    summary: {
      for_parent: '高架下の区間で駆け込み先が少なく、17時台は薄暗くなります。帰り道を一緒に確認し、明るい大通り側を通るよう伝えてあげてください。',
      for_child: 'かえりみちの　たかいかどうしたに　あぶないところが　あるよ。くらくなるまえに　とおろうね。',
      talking_points: ['高架下は明るい時間帯に通る', '何かあったらコンビニに駆け込む', '帰宅時刻を決めておく'],
      generated_at: `${dateStr}T22:00:12+09:00`,
      model: 'mock',
    },
    stats: {
      distance_m: 1840,
      duration_min: 42,
      point_count: 8,
      departed_at: `${dateStr}T15:30:00+09:00`,
      arrived_at: `${dateStr}T16:12:00+09:00`,
    },
  } satisfies DailyReadyResponse)
})

app.get('/v1/children/:child_id/weekly', (c) => {
  const childId = c.req.param('child_id')
  const endStr = queryParam(c, 'end') || '2026-08-20'
  const endParts = endStr.split('-').map(Number)
  const baseScores = [38, 42, 55, 61, 33, 47, 39]
  const hs = [false, false, true, true, false, false, false]
  const days: WeeklyDay[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(endParts[0], endParts[1] - 1, endParts[2] - i)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const ds = `${y}-${m}-${day}`
    const idx = 6 - i
    const s = baseScores[idx]
    days.push({ date: ds, total_score: s, level: levelFromScore(s), has_hotspot: hs[idx] })
  }
  return c.json({
    child_id: childId,
    end: endStr,
    days,
    average: 42,
    baseline_score: 39,
  } satisfies WeeklyResponse)
})

app.notFound((c) => c.json({
  error: { code: 'NOT_FOUND', message: `パス ${c.req.path} は存在しません` },
} satisfies ErrorBody, 404 as const))

export default app