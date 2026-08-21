export interface ParsedAiJson {
  for_parent: string
  for_child: string
  talking_points: string[]
}

function tryParse(raw: string): ParsedAiJson | null {
  try {
    const obj = JSON.parse(raw)
    if (
      obj && typeof obj === 'object' &&
      typeof obj.for_parent === 'string' &&
      typeof obj.for_child === 'string' &&
      Array.isArray(obj.talking_points)
    ) {
      return {
        for_parent: obj.for_parent,
        for_child: obj.for_child,
        talking_points: obj.talking_points.map((p: unknown) => String(p)),
      }
    }
  } catch {
    // フォールスルー
  }
  return null
}

// JSONのみのケースでまず試し、ダメなら ```json フェンスを剥がして再試行する。
export function parseAiJson(raw: string): ParsedAiJson | null {
  const direct = tryParse(raw.trim())
  if (direct) return direct

  const stripped = raw
    .trim()
    .replace(/^```json/i, '')
    .replace(/^```/, '')
    .replace(/```$/, '')
    .trim()
  return tryParse(stripped)
}
