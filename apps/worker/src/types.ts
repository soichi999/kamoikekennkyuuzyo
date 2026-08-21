export interface Env {
  DB: D1Database
  PAIRING_KV: KVNamespace
  SCORING_IMPL?: string
  AI_PROVIDER?: string
  ADMIN_TOKEN?: string
  ANTHROPIC_API_KEY?: string
  AI?: Ai
}

export interface Variables {
  familyId: string
}
