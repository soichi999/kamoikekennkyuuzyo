import type { Env } from '../types.js'
import type { RiskLevel } from '../score.js'
import type { Hotspot } from './types.js'
import { aggregateDaily } from './daily.js'
import { fetchDaily, fetchChildIdsWithLocationsOnDate, updateDailySummary } from './repository.js'
import { generateSummary } from '../ai/index.js'

// aggregateDaily（集計）→ AI要約生成 → daily.summary 更新、まで一括で行う。
// Cron からも /v1/admin/aggregate からも呼ばれる。
// AI生成が失敗しても集計自体は成功扱い（status: 'ready'）のまま。
export async function aggregateDailyWithSummary(env: Env, childId: string, date: string): Promise<void> {
  await aggregateDaily(env, childId, date)

  const row = await fetchDaily(env, childId, date)
  if (!row || row.status !== 'ready') return

  try {
    const hotspots = JSON.parse(row.hotspots ?? '[]') as Hotspot[]
    const summary = await generateSummary(env, {
      date,
      totalScore: row.total_score as number,
      level: row.level as RiskLevel,
      hotspots,
    })
    await updateDailySummary(env, childId, date, JSON.stringify(summary))
  } catch {
    // summary は null のまま。status は 'ready' を維持する。
  }
}

export async function runDailyAggregationForDate(env: Env, date: string): Promise<void> {
  const childIds = await fetchChildIdsWithLocationsOnDate(env, date)
  await Promise.allSettled(childIds.map(childId => aggregateDailyWithSummary(env, childId, date)))
}
