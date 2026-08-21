import { jstNow, toJSTString } from '../score.js'
import type { AiGenerateInput, AiSummary } from './types.js'

// AI呼び出しを行わない固定テンプレート生成。テストと障害時のフォールバックに使う。
export function generateTemplateSummary(input: AiGenerateInput): AiSummary {
  const top = input.hotspots[0]
  const forParent = top
    ? `**${top.title}**付近で${top.reason}が見られました。帰り道を一緒に確認し、注意すべき場所を伝えてあげてください。`
    : '今日は特に注意すべき地点はありませんでした。'
  const forChild = top
    ? 'かえりみちに　きをつけたい　ばしょが　あったよ。おうちのひとと　いっしょに　かくにんしてね。'
    : 'きょうの　かえりみちは　とくに　あぶないところは　なかったよ。'
  const talkingPoints = input.hotspots.slice(0, 3).map(h => `${h.title}: ${h.reason}`)

  return {
    format: 'markdown',
    for_parent: forParent,
    for_child: forChild,
    talking_points: talkingPoints.length > 0 ? talkingPoints : ['今日は目立った危険はありませんでした'],
    generated_at: toJSTString(jstNow()),
    model: 'template',
  }
}
