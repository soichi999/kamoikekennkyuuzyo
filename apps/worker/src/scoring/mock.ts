import {
  toJSTString, jstNow,
  calculateScore, levelFromScore, buildFactors, nearestRefuges,
} from '../score.js'
import type { ScorePointInput, ScorePointResult, ScoreGridInput, ScoreGridResult, NearestRefugeInput, NearestRefugeResult } from './index.js'

export function scorePoint({ lat, lng, at }: ScorePointInput): ScorePointResult {
  const atStr = at || toJSTString(jstNow())
  const score = calculateScore(lat, lng, atStr)
  return {
    score,
    level: levelFromScore(score),
    factors: buildFactors(lat, lng, atStr),
  }
}

export function scoreGrid({ bbox, at }: ScoreGridInput): ScoreGridResult {
  const atStr = at || toJSTString(jstNow())
  const [minLng, minLat, maxLng, maxLat] = bbox
  const cellSize = 0.0009
  const maxCells = 2000
  const cells: ScoreGridResult = []
  for (let lat = minLat; lat < maxLat && cells.length < maxCells; lat += cellSize) {
    for (let lng = minLng; lng < maxLng && cells.length < maxCells; lng += cellSize) {
      const score = calculateScore(lat, lng, atStr)
      cells.push({ lat: +lat.toFixed(4), lng: +lng.toFixed(4), score, level: levelFromScore(score) })
    }
  }
  return cells
}

export function nearestRefuge({ lat, lng }: NearestRefugeInput): NearestRefugeResult {
  return nearestRefuges(lat, lng)
}
