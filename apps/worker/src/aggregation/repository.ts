import type { Env } from '../types.js'
import type { ScoredPoint } from './types.js'
import type { RiskLevel, Factor, TrackPoint } from '../score.js'

interface LocationRow {
  lat: number
  lng: number
  at: string
  score: number
  level: RiskLevel
  factors: string
}

function dayStart(date: string): string {
  return `${date}T00:00:00+09:00`
}
function dayEnd(date: string): string {
  return `${date}T23:59:59+09:00`
}

export async function fetchDayLocations(env: Env, childId: string, date: string): Promise<ScoredPoint[]> {
  const { results } = await env.DB.prepare(
    `SELECT lat, lng, at, score, level, factors FROM location
     WHERE child_id = ? AND at >= ? AND at <= ?
     ORDER BY at ASC`
  ).bind(childId, dayStart(date), dayEnd(date)).all<LocationRow>()
  return results.map(r => ({
    lat: r.lat, lng: r.lng, at: r.at, score: r.score, level: r.level,
    factors: JSON.parse(r.factors) as Factor[],
  }))
}

export async function fetchTrack(env: Env, childId: string, date: string): Promise<TrackPoint[]> {
  const { results } = await env.DB.prepare(
    `SELECT lat, lng, at FROM location WHERE child_id = ? AND at >= ? AND at <= ? ORDER BY at ASC`
  ).bind(childId, dayStart(date), dayEnd(date)).all<TrackPoint>()
  return results
}

export interface PastDailyScore {
  date: string
  total_score: number
}

export async function fetchPastReadyScores(env: Env, childId: string, beforeDate: string, limit = 14): Promise<PastDailyScore[]> {
  const { results } = await env.DB.prepare(
    `SELECT date, total_score FROM daily
     WHERE child_id = ? AND date < ? AND status = 'ready' AND total_score IS NOT NULL
     ORDER BY date DESC LIMIT ?`
  ).bind(childId, beforeDate, limit).all<PastDailyScore>()
  return results
}

export interface DailyRow {
  child_id: string
  date: string
  status: string
  total_score: number | null
  level: string | null
  baseline_score: number | null
  diff_from_baseline: number | null
  hotspots: string | null
  summary: string | null
  stats: string | null
  generated_at: string | null
}

export async function upsertDaily(env: Env, row: DailyRow): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO daily (child_id, date, status, total_score, level, baseline_score, diff_from_baseline, hotspots, summary, stats, generated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (child_id, date) DO UPDATE SET
       status = excluded.status,
       total_score = excluded.total_score,
       level = excluded.level,
       baseline_score = excluded.baseline_score,
       diff_from_baseline = excluded.diff_from_baseline,
       hotspots = excluded.hotspots,
       summary = excluded.summary,
       stats = excluded.stats,
       generated_at = excluded.generated_at`
  ).bind(
    row.child_id, row.date, row.status, row.total_score, row.level,
    row.baseline_score, row.diff_from_baseline, row.hotspots, row.summary, row.stats, row.generated_at,
  ).run()
}

export async function updateDailySummary(env: Env, childId: string, date: string, summaryJson: string | null): Promise<void> {
  await env.DB.prepare('UPDATE daily SET summary = ? WHERE child_id = ? AND date = ?')
    .bind(summaryJson, childId, date)
    .run()
}

export async function fetchDaily(env: Env, childId: string, date: string): Promise<DailyRow | null> {
  const row = await env.DB.prepare(
    `SELECT child_id, date, status, total_score, level, baseline_score, diff_from_baseline, hotspots, summary, stats, generated_at
     FROM daily WHERE child_id = ? AND date = ?`
  ).bind(childId, date).first<DailyRow>()
  return row ?? null
}

export async function fetchDailyRange(env: Env, childId: string, startDate: string, endDate: string): Promise<DailyRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT child_id, date, status, total_score, level, baseline_score, diff_from_baseline, hotspots, summary, stats, generated_at
     FROM daily WHERE child_id = ? AND date >= ? AND date <= ?`
  ).bind(childId, startDate, endDate).all<DailyRow>()
  return results
}

export async function fetchChildIdsWithLocationsOnDate(env: Env, date: string): Promise<string[]> {
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT child_id FROM location WHERE at >= ? AND at <= ?`
  ).bind(dayStart(date), dayEnd(date)).all<{ child_id: string }>()
  return results.map(r => r.child_id)
}
