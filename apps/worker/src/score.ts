export type RiskLevel = 'safe' | 'caution' | 'danger'

export interface Factor {
  key: string
  label: string
  impact: number
  detail: string
}

export interface Refuge {
  type: 'kodomo110' | 'koban' | 'school' | 'public'
  name: string
  distance_m: number
}

export interface LocationPoint {
  lat: number
  lng: number
  at?: string
}

export interface LocationResult {
  lat: number
  lng: number
  at: string
  score: number
  level: RiskLevel
  factors: Factor[]
}

export interface GridCell {
  lat: number
  lng: number
  score: number
  level: RiskLevel
}

export interface TrackPoint {
  lat: number
  lng: number
  at: string
}

export function jstNow(): Date {
  const now = new Date()
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return jst
}

export function toJSTString(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  const h = String(date.getUTCHours()).padStart(2, '0')
  const min = String(date.getUTCMinutes()).padStart(2, '0')
  const s = String(date.getUTCSeconds()).padStart(2, '0')
  return `${y}-${m}-${d}T${h}:${min}:${s}+09:00`
}

export function toJSTDateString(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function parseJST(s?: string): Date {
  if (!s) return jstNow()
  const d = new Date(s)
  if (isNaN(d.getTime())) return jstNow()
  return new Date(d.getTime() + 9 * 60 * 60 * 1000)
}

export function getJSTHour(jstDate: Date): number {
  return jstDate.getUTCHours()
}

export function randomString(len: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let r = ''
  for (let i = 0; i < len; i++) r += chars[Math.floor(Math.random() * chars.length)]
  return r
}

export function randomDigits(len: number): string {
  let r = ''
  for (let i = 0; i < len; i++) r += Math.floor(Math.random() * 10)
  return r
}

export function hashScore(lat: number, lng: number): number {
  const ilat = Math.round(lat * 10000)
  const ilng = Math.round(lng * 10000)
  let h = (ilat * 31 + ilng * 37) ^ (ilng << 5)
  h = ((h ^ (h >>> 16)) * 0x45d9f3b) >>> 0
  h = ((h ^ (h >>> 13)) * 0x27eb69d) >>> 0
  h = (h ^ (h >>> 16)) >>> 0
  return h % 81
}

export function timeBonus(atStr: string): number {
  const jst = parseJST(atStr)
  const h = getJSTHour(jst)
  if (h >= 6 && h <= 14) return 0
  if (h >= 15 && h <= 16) return 6
  if (h >= 17 && h <= 18) return 18
  return 28
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

export function calculateScore(lat: number, lng: number, atStr: string): number {
  const base = hashScore(lat, lng)
  const bonus = timeBonus(atStr)
  return clamp(Math.round(base + bonus), 0, 100)
}

export function levelFromScore(s: number): RiskLevel {
  if (s <= 33) return 'safe'
  if (s <= 66) return 'caution'
  return 'danger'
}

export function buildFactors(lat: number, lng: number, atStr: string): Factor[] {
  const h = hashScore(lat, lng)
  const refugeCount = h % 3
  const crimeCount = (h >> 2) % 3
  const trafficCount = (h >> 4) % 3
  const lightingScore = (h >> 6) % 3
  const jst = parseJST(atStr)
  const hour = getJSTHour(jst)
  const factors: Factor[] = []
  factors.push({
    key: 'refuge',
    label: '駆け込み先',
    impact: 10 + refugeCount * 5,
    detail: refugeCount === 0 ? '半径300m内に0件' : `半径300m内に${refugeCount}件`,
  })
  if (crimeCount > 0) {
    factors.push({
      key: 'crime',
      label: '犯罪発生',
      impact: 5 + crimeCount * 4,
      detail: `周辺で直近期${crimeCount}件の犯罪発生`,
    })
  }
  if (trafficCount > 0) {
    factors.push({
      key: 'traffic',
      label: '交通事故',
      impact: 3 + trafficCount * 3,
      detail: `周辺で直近期${trafficCount}件の事故`,
    })
  }
  if (hour >= 17 || hour < 6) {
    factors.push({
      key: 'lighting',
      label: '街灯',
      impact: 8 + lightingScore * 4,
      detail: lightingScore === 0 ? '街灯が少ない区間' : '街灯設置済み区間',
    })
  }
  return factors
}

export function nearestRefuges(lat: number, lng: number): Refuge[] {
  const types = ['kodomo110', 'koban', 'school', 'public'] as const
  const names = ['山田商店', '桜丘交番', '桜丘小学校', '区立図書館']
  const h = hashScore(lat, lng)
  const count = 2 + (h % 2)
  const refuges: Refuge[] = []
  for (let i = 0; i < count; i++) {
    const idx = (h + i * 7) % types.length
    const dist = 100 + ((h >> (i * 3)) % 4) * 80
    refuges.push({ type: types[idx], name: names[idx], distance_m: dist })
  }
  return refuges
}