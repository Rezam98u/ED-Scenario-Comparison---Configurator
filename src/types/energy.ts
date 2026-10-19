//  TypeScript interfaces for Energy Dashboard data structures

// API-boundary types live in shared/ and are re-exported here for convenience
import type { Kpis, SavedScenario } from '../../shared/types'
export type { Kpis, SavedScenario }

export interface TimeSeries {
  consumption: number[]
  pv_generation: number[]
}

export interface Baseline extends TimeSeries { }
export interface Scenario extends TimeSeries { }

export interface EnergyApiResponse {
  timestamps: string[]
  baseline: Baseline
  scenario: Scenario
  kpis: Kpis
}

export interface ScenarioResult {
  scenario: Scenario
  kpis: Kpis
}

export interface ChartDataPoint {
  timestamp: string
  baseline_consumption: number
  baseline_pv: number
  scenario_consumption: number
  scenario_pv: number
}

// GET /api/energy/analysis (server-py/analysis.py). All days and hours are UTC.
export interface DailyStats {
  date: string // YYYY-MM-DD
  consumption_kwh: number
  pv_kwh: number
  self_consumed_kwh: number
  autarky_pct: number
}

export interface HourlyProfilePoint {
  hour: number // 0-23
  consumption_kwh: number
  pv_kwh: number
}

export interface EnergyAnalysis {
  daily: DailyStats[]
  hourlyProfile: HourlyProfilePoint[]
  peakConsumptionHour: number | null // null only when the dataset has no hours
  peakPvHour: number | null
}
