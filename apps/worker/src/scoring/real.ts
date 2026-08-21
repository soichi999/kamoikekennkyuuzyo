import type { ScorePointInput, ScorePointResult, ScoreGridInput, ScoreGridResult, NearestRefugeInput, NearestRefugeResult } from './index.js'

// 当日: オープンデータ（犯罪統計・街灯・交通事故等）を使ったスコア計算をここに実装する。
// index.ts のインターフェース（scorePoint / scoreGrid / nearestRefuge）は変更しないこと。

export function scorePoint(_input: ScorePointInput): ScorePointResult {
  throw new Error('scoring/real.ts: scorePoint is not implemented yet')
}

export function scoreGrid(_input: ScoreGridInput): ScoreGridResult {
  throw new Error('scoring/real.ts: scoreGrid is not implemented yet')
}

export function nearestRefuge(_input: NearestRefugeInput): NearestRefugeResult {
  throw new Error('scoring/real.ts: nearestRefuge is not implemented yet')
}
