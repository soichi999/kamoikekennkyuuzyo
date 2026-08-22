import type { ScorePointInput, ScorePointResult, ScoreGridInput, ScoreGridResult, NearestRefugeInput, NearestRefugeResult } from './index.js'
import { timeBonus, parseJST, getJSTHour } from '../score.js'
import { haversineDistanceMeters } from '../geo.js'
import kobanData from './data/koban.json'
import schoolData from './data/school.json'
import conveniData from './data/conveni.json'
import stationsData from './data/stations.json'
import townsData from './data/towns.json'

type Facility = { lat: number; lng: number; name: string; type: string }
type Town = { lat: number; lng: number; pop_density: number; station_flow: number; conveni_density: number }

const koban = kobanData as Facility[]
const schools = schoolData as Facility[]
const conveni = conveniData as Facility[]
const stations = stationsData as { lat: number; lng: number; passengers: number; name: string }[]
const towns = townsData as Town[]

// 係数（分析済み・変更禁止） interceptは学習時の値
const COEF = {
  intercept: -3.1485297822406175,
  log_station_flow: 0.1559720240963251,
  log_conveni_density: 0.16777628348126772,
  log_pop_density: -0.4540589222972984,
  log_dist_koban: -0.13984155039770518,
  log_dist_school: -0.08425354598644015,
}

function isSchoolOpen(atStr: string): boolean {
  const h = getJSTHour(parseJST(atStr))
  return h < 16
}

function findNearestTown(lat: number, lng: number): Town {
  let best: Town | null = null
  let bestDist = Infinity
  for (const t of towns) {
    const d = haversineDistanceMeters(lat, lng, t.lat, t.lng)
    if (d < bestDist) {
      bestDist = d
      best = t
    }
  }
  return best!
}

function nearestFacilityDist(lat: number, lng: number, facilities: Facility[]): number {
  let best = Infinity
  // bbox粗絞り: 500m ≈ 0.0045度
  const dLat = 0.0045
  const dLng = 0.0045 / Math.cos((lat * Math.PI) / 180)
  for (const f of facilities) {
    if (Math.abs(f.lat - lat) > dLat || Math.abs(f.lng - lng) > dLng) continue
    const d = haversineDistanceMeters(lat, lng, f.lat, f.lng)
    if (d < best) best = d
  }
  // bboxに1件もなければ全件走査（郊外）
  if (!isFinite(best)) {
    for (const f of facilities) {
      const d = haversineDistanceMeters(lat, lng, f.lat, f.lng)
      if (d < best) best = d
    }
  }
  return best
}

function refugeScore(lat: number, lng: number, atStr: string): { refuge: number; nearestKoban: number; nearestSchool: number; count300: number } {
  const open = isSchoolOpen(atStr)
  let refuge = 0
  let count300 = 0
  const all: { f: Facility; w: number; d: number }[] = []
  for (const f of koban) {
    const d = haversineDistanceMeters(lat, lng, f.lat, f.lng)
    if (d < 500) all.push({ f, w: 1.0, d })
  }
  for (const f of conveni) {
    const d = haversineDistanceMeters(lat, lng, f.lat, f.lng)
    if (d < 500) all.push({ f, w: 0.7, d })
  }
  for (const f of schools) {
    const d = haversineDistanceMeters(lat, lng, f.lat, f.lng)
    if (d < 500) all.push({ f, w: open ? 0.6 : 0, d })
  }
  // refugeは exp(-d/150) の重み付き和（500m以内のみで十分、遠いほど寄与小）
  for (const { w, d } of all) {
    if (w === 0) continue
    refuge += w * Math.exp(-d / 150)
    if (d <= 300) count300++
  }
  const nearestKoban = nearestFacilityDist(lat, lng, koban as Facility[])
  const nearestSchool = nearestFacilityDist(lat, lng, schools as Facility[])
  return { refuge, nearestKoban, nearestSchool, count300 }
}

function stationFlowAt(lat: number, lng: number): number {
  let flow = 0
  for (const s of stations) {
    const d = haversineDistanceMeters(lat, lng, s.lat, s.lng)
    // 3km以上は寄与無視（exp(-3000/800)=0.023）
    if (d > 3000) continue
    flow += s.passengers * Math.exp(-d / 800)
  }
  return flow
}

function riskScore(lat: number, lng: number, town: Town, distKoban: number, distSchool: number): number {
  const sf = stationFlowAt(lat, lng)
  // townの conveni_density / pop_density を使う（D1に持たせた値）
  const log_sf = Math.log(sf + 1)
  const log_cd = Math.log(town.conveni_density + 1)
  const log_pd = Math.log(Math.max(town.pop_density, 1))
  const log_dk = Math.log(Math.max(distKoban, 1))
  const log_ds = Math.log(Math.max(distSchool, 1))
  const logRisk =
    COEF.intercept +
    COEF.log_station_flow * log_sf +
    COEF.log_conveni_density * log_cd +
    COEF.log_pop_density * log_pd +
    COEF.log_dist_koban * log_dk +
    COEF.log_dist_school * log_ds
  return Math.exp(logRisk)
}

function normalizeScore(risk: number, refuge: number, atStr: string): number {
  // raw = risk / (refuge+0.1)  0.001〜0.01程度を想定 → logでスケーリング
  const raw = risk / (refuge + 0.1)
  // log(raw) は -7〜-3程度 → 30〜70にマッピング
  const logRaw = Math.log(Math.max(raw, 1e-9))
  // 経験的に -6.5→30, -3.5→70 になるよう線形変換
  let base = 30 + (logRaw + 6.5) * 13.3
  // 町全体で 20〜80 に収まるようクランプ前のベース
  base = Math.max(10, Math.min(80, base))
  const bonus = timeBonus(atStr)
  return Math.max(0, Math.min(100, Math.round(base + bonus)))
}

function buildRealFactors(lat: number, lng: number, atStr: string, town: Town, refuge: number, count300: number, distKoban: number, distSchool: number, risk: number): ScorePointResult['factors'] {
  const factors: ScorePointResult['factors'] = []
  // refuge
  const refugeImpact = Math.max(0, Math.round(15 - refuge * 4))
  factors.push({
    key: 'refuge',
    label: '駆け込み先',
    impact: refugeImpact,
    detail: count300 === 0 ? '半径300m内に0件' : `半径300m内に${count300}件（最寄り交番${Math.round(distKoban)}m）`,
  })
  // 人流（駅乗降客の距離減衰和）
  const stationFlow = stationFlowAt(lat, lng)
  const flowImpact = Math.min(20, Math.round(Math.log(stationFlow + 1) * 1.2))
  if (flowImpact > 3) {
    factors.push({
      key: 'traffic_flow',
      label: '人通りの多さ',
      impact: flowImpact,
      detail: `人流指標${Math.round(stationFlow).toLocaleString()}（駅乗降客の距離減衰和）`,
    })
  }
  // lighting / sunset : 日没後は必ず出す
  const h = getJSTHour(parseJST(atStr))
  if (h >= 17 || h < 6) {
    const lightingImpact = 8 + (h >= 19 || h < 5 ? 10 : 4)
    factors.push({
      key: 'lighting',
      label: '街灯',
      impact: lightingImpact,
      detail: h >= 19 || h < 5 ? '夜間（街灯が少ない区間）' : '日没後（街灯設置済み区間）',
    })
  }
  // 学校までの距離が遠い場合は追加で
  if (distSchool > 500) {
    factors.push({
      key: 'school',
      label: '学校からの距離',
      impact: 5,
      detail: `最寄り学校まで${Math.round(distSchool)}m`,
    })
  }
  return factors
}

export function scorePoint({ lat, lng, at }: ScorePointInput): ScorePointResult {
  const atStr = at || new Date().toISOString()
  const town = findNearestTown(lat, lng)
  const { refuge, nearestKoban, nearestSchool, count300 } = refugeScore(lat, lng, atStr)
  const risk = riskScore(lat, lng, town, nearestKoban, nearestSchool)
  const score = normalizeScore(risk, refuge, atStr)
  return {
    score,
    level: score <= 33 ? 'safe' : score <= 66 ? 'caution' : 'danger',
    factors: buildRealFactors(lat, lng, atStr, town, refuge, count300, nearestKoban, nearestSchool, risk),
  }
}

export function scoreGrid({ bbox, at }: ScoreGridInput): ScoreGridResult {
  const atStr = at || new Date().toISOString()
  const [minLng, minLat, maxLng, maxLat] = bbox
  const cellSize = 0.0009
  const maxCells = 2000
  const cells: ScoreGridResult = []
  for (let lat = minLat; lat < maxLat && cells.length < maxCells; lat += cellSize) {
    for (let lng = minLng; lng < maxLng && cells.length < maxCells; lng += cellSize) {
      const { score } = scorePoint({ lat: +lat.toFixed(4), lng: +lng.toFixed(4), at: atStr })
      cells.push({ lat: +lat.toFixed(4), lng: +lng.toFixed(4), score, level: score <= 33 ? 'safe' : score <= 66 ? 'caution' : 'danger' })
    }
  }
  return cells
}

export function nearestRefuge({ lat, lng, at }: NearestRefugeInput): NearestRefugeResult {
  const atStr = at || new Date().toISOString()
  const open = isSchoolOpen(atStr)
  const all: { type: 'koban' | 'school' | 'kodomo110'; name: string; dist: number }[] = []
  for (const f of koban) {
    const d = haversineDistanceMeters(lat, lng, f.lat, f.lng)
    all.push({ type: 'koban', name: f.name, dist: d })
  }
  for (const f of schools) {
    const d = haversineDistanceMeters(lat, lng, f.lat, f.lng)
    if (!open) continue
    all.push({ type: 'school', name: f.name, dist: d })
  }
  for (const f of conveni) {
    const d = haversineDistanceMeters(lat, lng, f.lat, f.lng)
    all.push({ type: 'kodomo110', name: f.name, dist: d })
  }
  all.sort((a, b) => a.dist - b.dist)
  return all.slice(0, 3).map(r => ({ type: r.type, name: r.name, distance_m: Math.round(r.dist) }))
}
