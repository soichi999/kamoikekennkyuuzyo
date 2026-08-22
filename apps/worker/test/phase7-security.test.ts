import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:test'
import worker from '../src/index'
import { randomString, randomDigits } from '../src/score'
import { MAX_PAIRING_FAILURES_PER_WINDOW } from '../src/rateLimit'
import { extractText } from '../src/ai/workersAi'

async function fetchApp(path: string, init?: RequestInit) {
  const req = new Request(`https://example.com${path}`, init)
  return worker.fetch(req, env as any, { waitUntil: () => {}, passThroughOnException: () => {} } as any)
}

function redeem(code: string, ip: string, childName = 'c') {
  return fetchApp('/v1/pairing/redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify({ code, child_name: childName }),
  })
}

async function createPairing() {
  const res = await fetchApp('/v1/pairing/create', { method: 'POST' })
  return await res.json() as { code: string; family_id: string }
}

// 存在しないコードを引くための、確実に未登録な6桁コード
let bogusCounter = 0
function bogusCode() {
  bogusCounter += 1
  return String(100000 + (bogusCounter % 900000))
}

describe('Phase 7-D: 暗号論的に安全なID生成', () => {
  it('randomString は 32文字の限定アルファベットのみを使う', () => {
    const s = randomString(500)
    expect(s).toHaveLength(500)
    // 紛らわしい i / l / o / u を含まない 32文字
    expect(s).toMatch(/^[0123456789abcdefghjkmnpqrstvwxyz]+$/)
  })

  it('randomString は呼び出しごとに異なる値を返す', () => {
    const seen = new Set(Array.from({ length: 200 }, () => randomString(22)))
    expect(seen.size).toBe(200)
  })

  it('randomDigits は指定桁数の数字のみを返し、各桁が偏らない', () => {
    const d = randomDigits(6)
    expect(d).toMatch(/^\d{6}$/)
    // rejection sampling が全数字を返しうることを確認する（剰余バイアスの粗い検査）
    const digits = new Set(randomDigits(3000).split(''))
    expect(digits.size).toBe(10)
  })

  it('family_id / child_id は fam_/chd_ + 22文字になる', async () => {
    const created = await createPairing()
    expect(created.family_id).toMatch(/^fam_[0123456789abcdefghjkmnpqrstvwxyz]{22}$/)
    const res = await redeem(created.code, '203.0.113.1')
    const body = await res.json() as { child_id: string }
    expect(body.child_id).toMatch(/^chd_[0123456789abcdefghjkmnpqrstvwxyz]{22}$/)
  })
})

describe('Phase 7-E: ペアリングコードの失敗回数レート制限', () => {
  it('失敗が上限を超えると 429 RATE_LIMITED を返す', async () => {
    const ip = '203.0.113.10'
    for (let i = 0; i < MAX_PAIRING_FAILURES_PER_WINDOW; i++) {
      const res = await redeem(bogusCode(), ip)
      expect(res.status).toBe(404)
    }
    const blocked = await redeem(bogusCode(), ip)
    expect(blocked.status).toBe(429)
    const body = await blocked.json() as any
    expect(body.error.code).toBe('RATE_LIMITED')
  })

  it('別IPは巻き込まれない', async () => {
    const ip = '203.0.113.20'
    for (let i = 0; i < MAX_PAIRING_FAILURES_PER_WINDOW + 1; i++) {
      await redeem(bogusCode(), ip)
    }
    expect((await redeem(bogusCode(), ip)).status).toBe(429)

    const created = await createPairing()
    const other = await redeem(created.code, '203.0.113.21')
    expect(other.status).toBe(200)
  })

  // これが失敗回数ベースにした最大の理由。会場Wi-Fiで全員が同一IPを共有していても、
  // 正当なペアリングが成功し続ける限り 429 にはならない。
  it('成功したペアリングはカウントされず、同一IPから上限を超えて成功できる', async () => {
    const ip = '203.0.113.30'
    for (let i = 0; i < MAX_PAIRING_FAILURES_PER_WINDOW + 5; i++) {
      const created = await createPairing()
      const res = await redeem(created.code, ip, `child-${i}`)
      expect(res.status).toBe(200)
    }
  })
})

describe('Phase 7: Workers AI 応答形状の取り出し', () => {
  // gemma-4 は OpenAI 互換形式で返す。ここを取り違えると要約が黙って
  // template にフォールバックし続けるため、形状ごとに固定しておく。
  it('OpenAI 互換形式から content を取り出す', () => {
    expect(extractText({
      choices: [{ message: { content: '{"a":1}', reasoning_content: '考え中...', role: 'assistant' } }],
      model: '@cf/google/gemma-4-26b-a4b-it-external',
    })).toBe('{"a":1}')
  })

  it('reasoning_content ではなく content を返す', () => {
    expect(extractText({
      choices: [{ message: { content: 'ほんとうの答え', reasoning_content: 'ここは使わない' } }],
    })).toBe('ほんとうの答え')
  })

  it('旧来の { response } 形式も受け付ける', () => {
    expect(extractText({ response: 'テキスト' })).toBe('テキスト')
  })

  it('未知の形状は null を返す', () => {
    expect(extractText({ foo: 'bar' })).toBeNull()
    expect(extractText({ choices: [] })).toBeNull()
    expect(extractText(null)).toBeNull()
    expect(extractText('文字列')).toBeNull()
  })
})
