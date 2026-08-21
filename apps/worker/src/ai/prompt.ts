import type { AiGenerateInput } from './types.js'

export function buildPrompt(input: AiGenerateInput): string {
  const hotspotsText = input.hotspots
    .map(h =>
      `- ${h.title} (score=${h.score}, stay_minutes=${h.stay_minutes}): ${h.reason} / factors: ${h.factors
        .map(f => `${f.label}(${f.detail})`)
        .join(', ') || 'なし'}`
    )
    .join('\n') || 'なし'

  return `あなたは子供の下校時の安全を見守る保護者向けアシスタントです。以下のデータをもとに、JSON形式のみを出力してください。前置き・説明文・\`\`\`json のようなコードフェンスは一切付けないこと。

# データ
- 日付: ${input.date}
- 総合スコア: ${input.totalScore} (${input.level})
- 危険ポイント:
${hotspotsText}

# 出力するJSONの形式
{
  "for_parent": "保護者向けメッセージ。Markdownで、太字(**text**)と箇条書き(- item)のみ使用可。見出し(#)は使わない。危険ポイント名は太字にする。なぜ危険か、どう子どもに伝えるかを書く。",
  "for_child": "子ども向けメッセージ。ひらがな多めで小学生が読める平易な語彙にする。Markdownは太字・箇条書きのみ使用可。",
  "talking_points": ["親が子に伝える要点。3つ以内。プレーンテキスト。"]
}`
}
