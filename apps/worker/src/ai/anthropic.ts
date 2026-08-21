import type { Env } from '../types.js'
import type { AiGenerateInput, AiSummary } from './types.js'
import { buildPrompt } from './prompt.js'
import { parseAiJson } from './parse.js'
import { jstNow, toJSTString } from '../score.js'

const MODEL = 'claude-haiku-4-5'
const TIMEOUT_MS = 10000

export async function generateWithAnthropic(env: Env, input: AiGenerateInput): Promise<AiSummary | null> {
  if (!env.ANTHROPIC_API_KEY) return null
  const prompt = buildPrompt(input)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    })
    if (!res.ok) return null

    const data = await res.json() as { content?: { text?: string }[] }
    const text = data.content?.[0]?.text
    if (typeof text !== 'string') return null

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
  } finally {
    clearTimeout(timeout)
  }
}
