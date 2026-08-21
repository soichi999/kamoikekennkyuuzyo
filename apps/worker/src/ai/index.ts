import type { Env } from '../types.js'
import type { AiGenerateInput, AiSummary } from './types.js'
import { generateTemplateSummary } from './template.js'
import { generateWithWorkersAi } from './workersAi.js'
import { generateWithAnthropic } from './anthropic.js'

export type { AiGenerateInput, AiSummary } from './types.js'

// AI_PROVIDER 環境変数で切り替える。既定は "template"。
// workers-ai / anthropic が失敗した場合（バインディング未設定・タイムアウト・不正なJSON等）は
// 例外を投げずに template にフォールバックする。呼び出し側は必ず有効な AiSummary を受け取る。
export async function generateSummary(env: Env, input: AiGenerateInput): Promise<AiSummary> {
  const provider = env.AI_PROVIDER ?? 'template'
  try {
    if (provider === 'workers-ai') {
      const result = await generateWithWorkersAi(env, input)
      if (result) return result
    } else if (provider === 'anthropic') {
      const result = await generateWithAnthropic(env, input)
      if (result) return result
    }
  } catch {
    // フォールバックへ
  }
  return generateTemplateSummary(input)
}
