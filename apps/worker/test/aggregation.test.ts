import { describe, it, expect } from 'vitest'
import { extractHotspots } from '../src/aggregation/hotspots.js'
import { computeDurationsMinutes, computeTotalScore } from '../src/aggregation/totalScore.js'
import { computeBaseline } from '../src/aggregation/baseline.js'
import { computeStats } from '../src/aggregation/stats.js'
import type { ScoredPoint, Hotspot } from '../src/aggregation/types.js'
import type { PastDailyScore } from '../src/aggregation/baseline.js'

function makePoint(
  lat: number,
  lng: number,
  at: string,
  score: number,
  level: ScoredPoint['level'] = 'danger',
  factors: ScoredPoint['factors'] = [],
): ScoredPoint {
  return { lat, lng, at, score, level, factors }
}

describe('extractHotspots', () => {
  it('5分以内・200m以内で近接するdanger点2つが1件のhotspotにまとまる', () => {
    const points: ScoredPoint[] = [
      makePoint(35.0, 139.0, '2026-08-21T15:00:00+09:00', 80, 'danger', [
        { key: 'refuge', label: '駆け込み先', impact: 15, detail: '半径300m内に1件' },
      ]),
      makePoint(35.001, 139.001, '2026-08-21T15:03:00+09:00', 90, 'danger', [
        { key: 'refuge', label: '駆け込み先', impact: 15, detail: '半径300m内に1件' },
      ]),
    ]
    const result = extractHotspots(points)
    expect(result).toHaveLength(1)
    expect(result[0].score).toBe(90)
    expect(result[0].stay_minutes).toBe(3)
  })

  it('10分離れたdanger点2つは別々のhotspotになる', () => {
    const points: ScoredPoint[] = [
      makePoint(35.0, 139.0, '2026-08-21T15:00:00+09:00', 80, 'danger', [
        { key: 'refuge', label: '駆け込み先', impact: 15, detail: '半径300m内に1件' },
      ]),
      makePoint(35.0, 139.001, '2026-08-21T15:10:00+09:00', 85, 'danger', [
        { key: 'refuge', label: '駆け込み先', impact: 15, detail: '半径300m内に1件' },
      ]),
    ]
    const result = extractHotspots(points)
    expect(result).toHaveLength(2)
  })

  it('300m離れたdanger点2つは別々のhotspotになる（時間は近くても）', () => {
    const points: ScoredPoint[] = [
      makePoint(35.0, 139.0, '2026-08-21T15:00:00+09:00', 80, 'danger', [
        { key: 'refuge', label: '駆け込み先', impact: 15, detail: '半径300m内に1件' },
      ]),
      makePoint(35.005, 139.0, '2026-08-21T15:02:00+09:00', 85, 'danger', [
        { key: 'refuge', label: '駆け込み先', impact: 15, detail: '半径300m内に1件' },
      ]),
    ]
    const result = extractHotspots(points)
    expect(result).toHaveLength(2)
  })

  it('danger(score>=67)が1つもない場合は空配列', () => {
    const points: ScoredPoint[] = [
      makePoint(35.0, 139.0, '2026-08-21T15:00:00+09:00', 30, 'safe'),
      makePoint(35.001, 139.001, '2026-08-21T15:03:00+09:00', 50, 'caution'),
    ]
    expect(extractHotspots(points)).toEqual([])
  })

  it('6件のクラスタがある場合、上位5件のみ返り、hotspot_idがhs_01〜hs_05で時刻昇順になっている', () => {
    const points: ScoredPoint[] = []
    // 各点を時間差＞5分かつ距離＞200mにして別クラスタにする
    for (let i = 0; i < 6; i++) {
      points.push(
        makePoint(35.0 + i * 0.01, 139.0, `2026-08-21T15:${String(i * 10).padStart(2, '0')}:00+09:00`, 70 + i, 'danger', [
          { key: 'traffic', label: '交通事故', impact: 6, detail: '周辺で直近期1件の事故' },
        ]),
      )
    }
    const result = extractHotspots(points)
    expect(result).toHaveLength(5)
    expect(result[0].hotspot_id).toBe('hs_01')
    expect(result[1].hotspot_id).toBe('hs_02')
    expect(result[2].hotspot_id).toBe('hs_03')
    expect(result[3].hotspot_id).toBe('hs_04')
    expect(result[4].hotspot_id).toBe('hs_05')
    for (let i = 1; i < result.length; i++) {
      expect(new Date(result[i].at).getTime()).toBeGreaterThan(new Date(result[i - 1].at).getTime())
    }
  })
})

describe('computeDurationsMinutes', () => {
  it('1点のみの場合は[1]を返す', () => {
    const points: ScoredPoint[] = [
      makePoint(35.0, 139.0, '2026-08-21T15:00:00+09:00', 50, 'caution'),
    ]
    expect(computeDurationsMinutes(points)).toEqual([1])
  })

  it('空配列の場合は[]を返す', () => {
    expect(computeDurationsMinutes([])).toEqual([])
  })
})

describe('computeTotalScore', () => {
  it('手計算した具体的な入力に対して期待値と一致する', () => {
    const points: ScoredPoint[] = [
      makePoint(35.0, 139.0, '2026-08-21T15:00:00+09:00', 80, 'danger'),
      makePoint(35.001, 139.001, '2026-08-21T15:20:00+09:00', 40, 'caution'),
    ]
    // durations: [20, 20] (最後の点は直前のdurationを流用)
    // weighted_avg = (80*20 + 40*20) / (20+20) = 2400/40 = 60
    // penalty = min(15, 0*5) = 0
    // total = min(100, round(60+0)) = 60
    expect(computeTotalScore(points, 0)).toBe(60)
  })

  it('hotspot_countが3のときpenaltyが15でキャップされる', () => {
    const points: ScoredPoint[] = [
      makePoint(35.0, 139.0, '2026-08-21T15:00:00+09:00', 50, 'caution'),
      makePoint(35.001, 139.001, '2026-08-21T15:20:00+09:00', 50, 'caution'),
    ]
    // hotspotCount=10でもpenaltyはmin(15, 10*5)=15
    const score1 = computeTotalScore(points, 3)
    const score2 = computeTotalScore(points, 10)
    expect(score1).toBe(score2)
  })

  it('空配列の場合は0を返す', () => {
    expect(computeTotalScore([], 0)).toBe(0)
  })
})

describe('computeBaseline', () => {
  it('6件のデータでnullを返す', () => {
    const scores: PastDailyScore[] = [
      { date: '2026-08-15', total_score: 10 },
      { date: '2026-08-16', total_score: 20 },
      { date: '2026-08-17', total_score: 30 },
      { date: '2026-08-18', total_score: 40 },
      { date: '2026-08-19', total_score: 50 },
      { date: '2026-08-20', total_score: 60 },
    ]
    expect(computeBaseline(scores)).toBeNull()
  })

  it('7件のデータで中央値が返る', () => {
    const scores: PastDailyScore[] = [
      { date: '2026-08-14', total_score: 10 },
      { date: '2026-08-15', total_score: 30 },
      { date: '2026-08-16', total_score: 50 },
      { date: '2026-08-17', total_score: 20 },
      { date: '2026-08-18', total_score: 60 },
      { date: '2026-08-19', total_score: 40 },
      { date: '2026-08-20', total_score: 70 },
    ]
    // sorted: [10, 20, 30, 40, 50, 60, 70], median = 40
    expect(computeBaseline(scores)).toBe(40)
  })

  it('8件（偶数）のデータで中央2件の平均が返る', () => {
    const scores: PastDailyScore[] = [
      { date: '2026-08-13', total_score: 10 },
      { date: '2026-08-14', total_score: 20 },
      { date: '2026-08-15', total_score: 30 },
      { date: '2026-08-16', total_score: 40 },
      { date: '2026-08-17', total_score: 50 },
      { date: '2026-08-18', total_score: 60 },
      { date: '2026-08-19', total_score: 70 },
      { date: '2026-08-20', total_score: 80 },
    ]
    // sorted: [10,20,30,40,50,60,70,80], mid2 = 40,50 => avg=45
    expect(computeBaseline(scores)).toBe(45)
  })
})

describe('computeStats', () => {
  it('3点の距離・時間・件数が期待通りになる', () => {
    const points: ScoredPoint[] = [
      makePoint(35.0, 139.0, '2026-08-21T15:00:00+09:00', 50, 'caution'),
      makePoint(35.01, 139.01, '2026-08-21T15:10:00+09:00', 60, 'caution'),
      makePoint(35.02, 139.02, '2026-08-21T15:20:00+09:00', 70, 'danger'),
    ]
    const stats = computeStats(points)
    expect(stats.point_count).toBe(3)
    expect(stats.duration_min).toBe(20)
    expect(stats.departed_at).toBe('2026-08-21T15:00:00+09:00')
    expect(stats.arrived_at).toBe('2026-08-21T15:20:00+09:00')
    expect(stats.distance_m).toBeGreaterThan(2800)
    expect(stats.distance_m).toBeLessThan(3000)
  })
})
