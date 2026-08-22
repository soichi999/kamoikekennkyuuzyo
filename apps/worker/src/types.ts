export interface Env {
  DB: D1Database
  PAIRING_KV: KVNamespace
  SCORING_IMPL?: string
  AI_PROVIDER?: 'workers-ai' | 'template'
  ADMIN_TOKEN?: string
  AI?: Ai
}

export interface Variables {
  familyId: string
}
