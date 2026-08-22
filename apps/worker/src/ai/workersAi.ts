import type { Env } from '../types.js'
import type { AiGenerateInput, AiSummary } from './types.js'
import { buildPrompt } from './prompt.js'
import { parseAiJson } from './parse.js'
import { jstNow, toJSTString } from '../score.js'

// ハッカソン特典の Cloudflare Workers AI モデル（本プロジェクトはこのモデルのみを使う）
const MODEL = '@cf/google/gemma-4-26b-a4b-it'
const TIMEOUT_MS = 10000

export async function generateWithWorkersAi(env: Env, input: AiGenerateInput): Promise<AiSummary | null> {
  if (!env.AI) return null
  const prompt = buildPrompt(input)

  const result = await Promise.race([
    env.AI.run(MODEL as any, { messages: [{ role: 'user', content: prompt }] }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('workers-ai timeout')), TIMEOUT_MS)),
  ])

  const response = (result as unknown as { response?: unknown }).response
  const text = typeof response === 'string' ? response : JSON.stringify(result)

  const parsed = parseAiJson(text)
  if (!parsed) return null

  return {
    format: 'markdown',
    for_parent: parsed.for_parent,
    for_child: parsed.for_child,
    talking_points: parsed.talking_points.slice(0, 3),
    generated_at: toJSTString(jstNow()),
    model: MODEL,
  }
}
