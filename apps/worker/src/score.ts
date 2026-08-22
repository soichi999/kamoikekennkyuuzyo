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

// ID・ペアリングコードの生成には必ず crypto.getRandomValues() を使う。
// Math.random() は暗号学的に安全ではなく、出力から内部状態を復元されうるため、
// family_id / child_id / ペアリングコードのような推測されては困る値には使わない。

// ちょうど32文字（2の冪）の英数字。ビットマスク(& 31)で剰余バイアス無しに選べる。
// 紛らわしい文字 (i, l, o, u) は除外している。
const ID_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'

export function randomString(len: number): string {
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  let r = ''
  for (let i = 0; i < len; i++) r += ID_ALPHABET[bytes[i]! & 31]
  return r
}

// 0-9 の一様乱数。256 は 10 で割り切れないため、剰余バイアスを避けるべく
// 250 以上のバイトは捨てて引き直す（rejection sampling）。
export function randomDigits(len: number): string {
  let r = ''
  while (r.length < len) {
    const bytes = new Uint8Array(len - r.length)
    crypto.getRandomValues(bytes)
    for (const b of bytes) {
      if (b >= 250) continue
      r += b % 10
    }
  }
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