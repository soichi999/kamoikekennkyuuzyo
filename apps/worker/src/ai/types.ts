import type { Hotspot } from '../aggregation/types.js'
import type { RiskLevel } from '../score.js'

export interface AiSummary {
  format: 'markdown'
  for_parent: string
  for_child: string
  talking_points: string[]
  generated_at: string
  model: string
}

export interface AiGenerateInput {
  date: string
  totalScore: number
  level: RiskLevel
  hotspots: Hotspot[]
}
