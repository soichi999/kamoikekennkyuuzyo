import { haversineDistanceMeters } from '../geo.js'
import type { ScoredPoint, DailyStats } from './types.js'

export function computeStats(points: ScoredPoint[]): DailyStats {
  let distanceM = 0
  for (let i = 0; i < points.length - 1; i++) {
    distanceM += haversineDistanceMeters(
      points[i].lat,
      points[i].lng,
      points[i + 1].lat,
      points[i + 1].lng,
    )
  }

  const firstAt = new Date(points[0].at).getTime()
  const lastAt = new Date(points[points.length - 1].at).getTime()
  const durationMin = Math.round((lastAt - firstAt) / 60000)

  return {
    distance_m: Math.round(distanceM),
    duration_min: durationMin,
    point_count: points.length,
    departed_at: points[0].at,
    arrived_at: points[points.length - 1].at,
  }
}
