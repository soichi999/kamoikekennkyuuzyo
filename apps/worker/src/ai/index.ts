import type { Env } from '../types.js'
import type { AiGenerateInput, AiSummary } from './types.js'
import { generateTemplateSummary } from './template.js'
import { generateWithWorkersAi } from './workersAi.js'

export type { AiGenerateInput, AiSummary } from './types.js'

// AI_PROVIDER 環境変数で切り替える。既定は "template"。
// 本プロジェクトで使う AI は Cloudflare Workers AI のみ（外部 AI API は使わない）。
// workers-ai が失敗した場合（バインディング未設定・タイムアウト・不正なJSON等）は
// 例外を投げずに template にフォールバックする。呼び出し側は必ず有効な AiSummary を受け取る。
export async function generateSummary(env: Env, input: AiGenerateInput): Promise<AiSummary> {
  const provider = env.AI_PROVIDER ?? 'template'
  try {
    if (provider === 'workers-ai') {
      const result = await generateWithWorkersAi(env, input)
      if (result) return result
      console.error('[ai] workers-ai が結果を返さなかったため template にフォールバックします')
    }
  } catch (err) {
    // フォールバックへ。無言で落とすと本番で原因が追えないため必ず記録する。
    console.error('[ai] 生成に失敗したため template にフォールバックします:', err)
  }
  return generateTemplateSummary(input)
}
