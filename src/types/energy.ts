/**
 * TypeScript interfaces for Energy Dashboard data structures
 */

export interface TimeSeries {
  consumption: number[]
  pv_generation: number[]
}

export interface Baseline extends TimeSeries {}

export interface Scenario extends TimeSeries {}

export interface Kpis {
  total_consumption_kwh: number
  pv_coverage_pct: number
  co2_savings_ton: number
}

export interface EnergyApiResponse {
  timestamps: string[]
  baseline: Baseline
  scenario: Scenario
  kpis: Kpis
}

export interface CalculationOptions {
  /** Hours of peak sun per day (default: 4) */
  hours_per_day?: number
  /** Self-consumption share of PV generation (default: 0.6) */
  self_consumption_share?: number
  /** CO2 emission factor in kg/kWh (default: 0.4) */
  co2_emission_factor?: number
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
