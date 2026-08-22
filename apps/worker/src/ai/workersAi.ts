import type { Env } from '../types.js'
import type { AiGenerateInput, AiSummary } from './types.js'
import { buildPrompt } from './prompt.js'
import { parseAiJson } from './parse.js'
import { jstNow, toJSTString } from '../score.js'

// ハッカソン特典の Cloudflare Workers AI モデル（本プロジェクトはこのモデルのみを使う）
const MODEL = '@cf/google/gemma-4-26b-a4b-it'
// gemma-4 は推論モデルで、本文とは別に reasoning_content を生成する。
// この推論トークンも max_tokens を消費するため、上限が小さいと推論だけで打ち切られ、
// content が空文字のまま finish_reason='length' で返ってくる（＝要約が黙って template に落ちる）。
// 実測: 1024/2048 では打ち切り、4096 で完走（completion_tokens 約1300、14秒前後）。
const MAX_TOKENS = 4096
// 推論の長さは実行ごとにばらつく（2048上限で打ち切られた回は21.7秒）。余裕をみて40秒。
const TIMEOUT_MS = 40000

// Workers AI のテキスト応答を取り出す。
// gemma-4 は OpenAI 互換形式 { choices: [{ message: { content, reasoning_content } }] } を返す。
// 推論モデルのため reasoning_content が別に付くが、使うのは content のみ。
// 他のモデルが返す { response: "..." } 形式も引き続き受け付ける。
export function extractText(result: unknown): string | null {
  if (typeof result !== 'object' || result === null) return null

  const openai = result as { choices?: Array<{ message?: { content?: unknown } }> }
  const content = openai.choices?.[0]?.message?.content
  if (typeof content === 'string') return content

  const legacy = (result as { response?: unknown }).response
  if (typeof legacy === 'string') return legacy

  return null
}

export async function generateWithWorkersAi(env: Env, input: AiGenerateInput): Promise<AiSummary | null> {
  if (!env.AI) {
    console.error('[ai] AI バインディングが未設定です')
    return null
  }
  const prompt = buildPrompt(input)
  const startedAt = Date.now()

  const result = await Promise.race([
    env.AI.run(MODEL as any, { messages: [{ role: 'user', content: prompt }], max_tokens: MAX_TOKENS } as any),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('workers-ai timeout')), TIMEOUT_MS)),
  ])

  console.error(`[ai] 応答まで ${Date.now() - startedAt}ms`)

  const text = extractText(result)
  if (text === null) {
    console.error('[ai] 想定外の応答形状です。keys:', Object.keys(result as object))
    return null
  }

  const parsed = parseAiJson(text)
  if (!parsed) {
    // 応答本文には位置情報が含まれうるため、切り詰めて記録する。
    console.error('[ai] 応答のJSONパースに失敗しました。raw(先頭300字):', text.slice(0, 300))
    return null
  }

  return {
    format: 'markdown',
    for_parent: parsed.for_parent,
    for_child: parsed.for_child,
    talking_points: parsed.talking_points.slice(0, 3),
    generated_at: toJSTString(jstNow()),
    model: MODEL,
  }
}
