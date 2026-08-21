import { haversineDistanceMeters } from '../geo.js'
import type { ScoredPoint, Hotspot } from './types.js'

export function extractHotspots(points: ScoredPoint[]): Hotspot[] {
  const candidates = points.filter((p) => p.score >= 67)
  if (candidates.length === 0) return []

  const clusters: ScoredPoint[][] = []
  let currentCluster: ScoredPoint[] = [candidates[0]]

  for (let i = 1; i < candidates.length; i++) {
    const prev = candidates[i - 1]
    const curr = candidates[i]
    const timeDiffSec =
      (new Date(curr.at).getTime() - new Date(prev.at).getTime()) / 1000
    const distMeters = haversineDistanceMeters(prev.lat, prev.lng, curr.lat, curr.lng)

    if (timeDiffSec <= 300 && distMeters <= 200) {
      currentCluster.push(curr)
    } else {
      clusters.push(currentCluster)
      currentCluster = [curr]
    }
  }
  clusters.push(currentCluster)

  let hotspots: Hotspot[] = clusters
    .map((cluster, idx) => {
      let maxScore = -1
      let bestPoint: ScoredPoint | null = null
      for (const pt of cluster) {
        if (pt.score > maxScore || (pt.score === maxScore && bestPoint !== null && pt.at < bestPoint.at)) {
          maxScore = pt.score
          bestPoint = pt
        }
      }
      const firstAt = new Date(cluster[0].at).getTime()
      const lastAt = new Date(cluster[cluster.length - 1].at).getTime()
      const stayMinutes = cluster.length === 1 ? 0 : Math.round((lastAt - firstAt) / 60000)

      if (bestPoint === null) throw new Error('unreachable: cluster is always non-empty')
      const factor = bestPoint.factors.reduce((a, b) => (a.impact >= b.impact ? a : b))
      let reason: string
      if (bestPoint.factors.length === 0) {
        reason = '周辺データからリスクが高いと判定された区間'
      } else {
        const key = factor.key
        if (key === 'refuge') reason = '駆け込み先が少ない区間'
        else if (key === 'crime') reason = '犯罪発生が多い区間'
        else if (key === 'traffic') reason = '交通量が多く見通しが悪い区間'
        else if (key === 'lighting') reason = '街灯が少なく暗い区間'
        else reason = '周辺データからリスクが高いと判定された区間'
      }

      // 当日、逆ジオコーディングでtitleに実際の地名を入れる
      const title = `地点(${bestPoint.lat.toFixed(4)}, ${bestPoint.lng.toFixed(4)})`

      return {
        hotspot_id: `hs_${String(idx + 1).padStart(2, '0')}`,
        lat: bestPoint.lat,
        lng: bestPoint.lng,
        score: maxScore,
        level: bestPoint.level,
        at: bestPoint.at,
        title,
        reason,
        factors: bestPoint.factors,
        stay_minutes: stayMinutes,
      }
    })

  if (hotspots.length > 5) {
    hotspots.sort((a, b) => b.score - a.score)
    hotspots = hotspots.slice(0, 5)
  }

  hotspots.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
  hotspots = hotspots.map((h, i) => ({
    ...h,
    hotspot_id: `hs_${String(i + 1).padStart(2, '0')}`,
  }))

  return hotspots
}
