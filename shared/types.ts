// Shared API-boundary types — used by both frontend (src/) and backend (server/src/)

export interface Kpis {
  total_consumption_kwh: number
  pv_coverage_pct: number
  co2_savings_ton: number
}

export interface SavedScenario {
  id: string
  pvKw: number
  kpis: Kpis
  savedAt: string
}

// ─── AI Agent types ──────────────────────────────────────────────────────────

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool'

export interface ChatToolCall {
  id: string
  name: string
  arguments: string
}

export interface ChatMessage {
  role: ChatRole
  content: string | null
  tool_calls?: ChatToolCall[]
  tool_call_id?: string
  name?: string
}

export interface ChatRequest {
  messages: ChatMessage[]
}

export interface ChatResponse {
  messages: ChatMessage[]
}
