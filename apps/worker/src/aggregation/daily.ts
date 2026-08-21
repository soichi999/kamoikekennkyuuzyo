import { jstNow, toJSTString, levelFromScore } from '../score.js'
import type { Env } from '../types.js'
import { extractHotspots } from './hotspots.js'
import { computeTotalScore } from './totalScore.js'
import { computeBaseline } from './baseline.js'
import { computeStats } from './stats.js'
import { fetchDayLocations, fetchPastReadyScores, upsertDaily } from './repository.js'

// Cron からも手動 (/v1/admin/aggregate) からも呼べる日次集計関数。
// この時点では summary は null のまま保存する（AI生成は Phase 5 で別途行う）。
export async function aggregateDaily(env: Env, childId: string, date: string): Promise<void> {
  const points = await fetchDayLocations(env, childId, date)
  const generatedAt = toJSTString(jstNow())

  if (points.length === 0) {
    await upsertDaily(env, {
      child_id: childId,
      date,
      status: 'no_data',
      total_score: null,
      level: null,
      baseline_score: null,
      diff_from_baseline: null,
      hotspots: null,
      summary: null,
      stats: null,
      generated_at: generatedAt,
    })
    return
  }

  const hotspots = extractHotspots(points)
  const totalScore = computeTotalScore(points, hotspots.length)
  const level = levelFromScore(totalScore)
  const stats = computeStats(points)

  const pastScores = await fetchPastReadyScores(env, childId, date, 14)
  const baseline = computeBaseline(pastScores)
  const diffFromBaseline = baseline === null ? null : totalScore - baseline

  await upsertDaily(env, {
    child_id: childId,
    date,
    status: 'ready',
    total_score: totalScore,
    level,
    baseline_score: baseline,
    diff_from_baseline: diffFromBaseline,
    hotspots: JSON.stringify(hotspots),
    summary: null,
    stats: JSON.stringify(stats),
    generated_at: generatedAt,
  })
}
