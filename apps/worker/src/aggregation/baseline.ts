export interface PastDailyScore {
  date: string
  total_score: number
}

export function computeBaseline(pastScores: PastDailyScore[]): number | null {
  if (pastScores.length < 7) return null

  const sorted = [...pastScores].map((s) => s.total_score).sort((a, b) => a - b)
  const n = sorted.length

  if (n % 2 === 0) {
    const mid = n / 2
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2)
  } else {
    return sorted[(n - 1) / 2]
  }
}
