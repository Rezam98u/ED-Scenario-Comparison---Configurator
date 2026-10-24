// API-boundary types used by the frontend (src/); server-py mirrors them as Pydantic models

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
  datasetId: string // the period the KPIs were calculated for
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
  datasetId?: string | null // the period the dashboard shows; null = the default
}

export interface ChatResponse {
  messages: ChatMessage[]
  showDatasetId?: string // set when the agent loaded a period: the dashboard switches to it
}
