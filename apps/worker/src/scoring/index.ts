import type { Factor, RiskLevel, Refuge } from '../score.js'
import * as mockImpl from './mock.js'
import * as realImpl from './real.js'

export interface ScorePointInput {
  lat: number
  lng: number
  at?: string
}

export interface ScorePointResult {
  score: number
  level: RiskLevel
  factors: Factor[]
}

export interface ScoreGridInput {
  bbox: [minLng: number, minLat: number, maxLng: number, maxLat: number]
  zoom?: number
  at?: string
}

export type ScoreGridResult = { lat: number; lng: number; score: number; level: RiskLevel }[]

export interface NearestRefugeInput {
  lat: number
  lng: number
  at?: string
}

export type NearestRefugeResult = Refuge[]

export interface ScoringImpl {
  scorePoint(input: ScorePointInput): ScorePointResult
  scoreGrid(input: ScoreGridInput): ScoreGridResult
  nearestRefuge(input: NearestRefugeInput): NearestRefugeResult
}

// SCORING_IMPL 環境変数で切り替える。既定は "mock"。
// 集計・Cron・AI などのコードは mock.ts / real.ts を直接 import せず、必ずこのファイル経由で呼ぶこと。
export function getScoringImpl(scoringImplEnv?: string): ScoringImpl {
  if (scoringImplEnv === 'real') return realImpl
  return mockImpl
}

export function scorePoint(input: ScorePointInput, scoringImplEnv?: string): ScorePointResult {
  return getScoringImpl(scoringImplEnv).scorePoint(input)
}

export function scoreGrid(input: ScoreGridInput, scoringImplEnv?: string): ScoreGridResult {
  return getScoringImpl(scoringImplEnv).scoreGrid(input)
}

export function nearestRefuge(input: NearestRefugeInput, scoringImplEnv?: string): NearestRefugeResult {
  return getScoringImpl(scoringImplEnv).nearestRefuge(input)
}
