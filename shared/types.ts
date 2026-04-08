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
