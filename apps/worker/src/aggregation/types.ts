import type { RiskLevel, Factor } from '../score.js'

export interface ScoredPoint {
  lat: number
  lng: number
  at: string // ISO8601, 例 "2026-08-21T15:42:00+09:00"
  score: number // 0-100
  level: RiskLevel
  factors: Factor[]
}

export interface Hotspot {
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

export interface DailyStats {
  distance_m: number
  duration_min: number
  point_count: number
  departed_at: string
  arrived_at: string
}
