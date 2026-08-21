import type { ScoredPoint } from './types.js'

export function computeDurationsMinutes(points: ScoredPoint[]): number[] {
  if (points.length <= 1) {
    return points.length === 0 ? [] : [1]
  }

  const durations: number[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const diffMs = new Date(points[i + 1].at).getTime() - new Date(points[i].at).getTime()
    const diffMin = Math.max(0, Math.min(30, diffMs / 60000))
    durations.push(diffMin)
  }

  const lastDuration = durations[durations.length - 1]
  durations.push(lastDuration)

  return durations
}

export function computeTotalScore(points: ScoredPoint[], hotspotCount: number): number {
  if (points.length === 0) return 0

  const durations = computeDurationsMinutes(points)
  let weightedSum = 0
  let totalWeight = 0
  for (let i = 0; i < points.length; i++) {
    weightedSum += points[i].score * durations[i]
    totalWeight += durations[i]
  }

  const weightedAvg = totalWeight > 0 ? weightedSum / totalWeight : 0
  const penalty = Math.min(15, hotspotCount * 5)
  const totalScore = Math.min(100, Math.round(weightedAvg + penalty))

  return totalScore
}
