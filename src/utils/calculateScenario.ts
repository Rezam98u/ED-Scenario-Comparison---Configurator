
// Frontend Business Logic

import type { Baseline, Scenario, Kpis, ScenarioResult } from '../types/energy'

const HOURS_PER_DAY = 4         // Peak sun hours per day
const SELF_CONSUMPTION = 0.6    // 60% of PV generation is self-consumed
const CO2_FACTOR = 0.4          // kg CO2 per kWh from grid

export function calculateScenario(baseline: Baseline, pvKw: number): ScenarioResult {
  if (pvKw < 0) throw new Error('PV capacity cannot be negative')

  const additionalPvPerHour = (pvKw * HOURS_PER_DAY) / 24

  // Compute max once — avoids O(n²) Math.max(...array) inside the loop
  const maxBasePv = Math.max(...baseline.pv_generation)

  const scenario: Scenario = { consumption: [], pv_generation: [] }

  for (let i = 0; i < baseline.consumption.length; i++) {
    const baseConsumption = baseline.consumption[i]
    const basePvGeneration = baseline.pv_generation[i]

    let newPvGeneration = basePvGeneration

    if (pvKw > 0) {
      if (basePvGeneration > 0 && maxBasePv > 0) {
        const scaleFactor = basePvGeneration / maxBasePv
        newPvGeneration = basePvGeneration + additionalPvPerHour * scaleFactor
      } else {
        newPvGeneration = additionalPvPerHour * 0.1
      }
    }

    const additionalPv = newPvGeneration - basePvGeneration
    const consumptionReduction = Math.min(
      additionalPv * SELF_CONSUMPTION,
      baseConsumption * 0.8
    )
    const newConsumption = Math.max(
      baseConsumption - consumptionReduction,
      baseConsumption * 0.2
    )

    scenario.consumption.push(newConsumption)
    scenario.pv_generation.push(newPvGeneration)
  }

  const totalBaselineConsumption = baseline.consumption.reduce((s, v) => s + v, 0)
  const totalScenarioConsumption = scenario.consumption.reduce((s, v) => s + v, 0)
  const totalPvGeneration = scenario.pv_generation.reduce((s, v) => s + v, 0)

  const consumptionSavings = totalBaselineConsumption - totalScenarioConsumption
  const pvCoveragePct = totalBaselineConsumption > 0
    ? (totalPvGeneration / totalBaselineConsumption) * 100
    : 0
  const co2SavingsTon = (consumptionSavings * CO2_FACTOR) / 1000

  const kpis: Kpis = {
    total_consumption_kwh: Math.round(totalScenarioConsumption * 10) / 10,
    pv_coverage_pct: Math.round(pvCoveragePct * 10) / 10,
    co2_savings_ton: Math.round(co2SavingsTon * 1000) / 1000,
  }

  return { scenario, kpis }
}
