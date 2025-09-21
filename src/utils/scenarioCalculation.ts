import type {
  Baseline,
  Scenario,
  ScenarioResult,
  CalculationOptions,
  Kpis,
} from '../types'

/**
 * Default calculation constants used in scenario modeling
 */
export const DEFAULT_CALCULATION_OPTIONS: Required<CalculationOptions> = {
  hours_per_day: 4, // Peak sun hours per day
  self_consumption_share: 0.6, // 60% of PV generation is self-consumed
  co2_emission_factor: 0.4, // kg CO2 per kWh from grid
}

/**
 * Calculates scenario data based on baseline and additional PV capacity
 * 
 * Algorithm:
 * 1. For each timestamp, calculate additional PV generation:
 *    additionalPV[t] = baseline.pv_generation[t] + pv_kW * hours_per_day * self_consumption_share / 24
 * 
 * 2. Reduce consumption proportionally to additional PV generation:
 *    newConsumption[t] = baseline.consumption[t] - min(additionalPV[t] * self_consumption_share, baseline.consumption[t])
 * 
 * 3. Calculate KPIs:
 *    - Total consumption: sum of all consumption values
 *    - PV coverage: (total PV generation / total original consumption) * 100
 *    - CO2 savings: (baseline consumption - scenario consumption) * co2_emission_factor / 1000
 * 
 * @param baseline - Original energy data
 * @param pvKw - Additional PV capacity in kW
 * @param options - Calculation parameters (optional)
 * @returns Calculated scenario and KPIs
 */
export function calculateScenario(
  baseline: Baseline,
  pvKw: number,
  options: CalculationOptions = {}
): ScenarioResult {
  const opts = { ...DEFAULT_CALCULATION_OPTIONS, ...options }
  
  if (pvKw < 0) {
    throw new Error('PV capacity cannot be negative')
  }

  // Calculate additional PV generation per hour based on added capacity
  const additionalPvPerHour = (pvKw * opts.hours_per_day) / 24

  const scenario: Scenario = {
    consumption: [],
    pv_generation: [],
  }

  // Process each timestamp
  for (let i = 0; i < baseline.consumption.length; i++) {
    const baseConsumption = baseline.consumption[i]
    const basePvGeneration = baseline.pv_generation[i]
    
    // Calculate new PV generation (baseline + additional from new capacity)
    let newPvGeneration = basePvGeneration
    
    if (pvKw > 0) {
      if (basePvGeneration > 0) {
        // Scale additional PV based on existing generation pattern
        const maxBasePv = Math.max(...baseline.pv_generation)
        if (maxBasePv > 0) {
          const scaleFactor = basePvGeneration / maxBasePv
          newPvGeneration = basePvGeneration + (additionalPvPerHour * scaleFactor)
        }
      } else {
        // If baseline has no PV but we're adding capacity, assume minimal generation during non-peak hours
        newPvGeneration = additionalPvPerHour * 0.1
      }
    }
    
    // Calculate consumption reduction based on self-consumed PV
    const additionalPv = newPvGeneration - basePvGeneration
    const consumptionReduction = Math.min(
      additionalPv * opts.self_consumption_share,
      baseConsumption * 0.8 // Max 80% reduction to keep realistic
    )
    
    const newConsumption = Math.max(
      baseConsumption - consumptionReduction,
      baseConsumption * 0.2 // Minimum 20% of original consumption
    )
    
    scenario.consumption.push(newConsumption)
    scenario.pv_generation.push(newPvGeneration)
  }

  // Calculate KPIs
  const totalBaselineConsumption = baseline.consumption.reduce((sum, val) => sum + val, 0)
  const totalScenarioConsumption = scenario.consumption.reduce((sum, val) => sum + val, 0)
  const totalPvGeneration = scenario.pv_generation.reduce((sum, val) => sum + val, 0)
  
  const consumptionSavings = totalBaselineConsumption - totalScenarioConsumption
  const pvCoveragePct = totalBaselineConsumption > 0 
    ? (totalPvGeneration / totalBaselineConsumption) * 100 
    : 0
  const co2SavingsTon = (consumptionSavings * opts.co2_emission_factor) / 1000

  const kpis: Kpis = {
    total_consumption_kwh: Math.round(totalScenarioConsumption * 10) / 10,
    pv_coverage_pct: Math.round(pvCoveragePct * 10) / 10,
    co2_savings_ton: Math.round(co2SavingsTon * 1000) / 1000, // Round to 3 decimal places to avoid 0
  }

  return { scenario, kpis }
}
