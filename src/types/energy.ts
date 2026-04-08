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
