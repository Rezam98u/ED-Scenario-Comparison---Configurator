import { describe, it, expect } from 'vitest'
import { calculateScenario } from './calculateScenario'

// ─── shared fixtures ────────────────────────────────────────────────────────

const baselineWithPv = {
  consumption:    [100, 200, 150],
  pv_generation:  [10,  20,  5],   // maxBasePv = 20
}

const baselineZeroPv = {
  consumption:   [100, 200, 150],
  pv_generation: [0,   0,   0],
}

const baselineZeroConsumption = {
  consumption:   [0, 0, 0],
  pv_generation: [0, 0, 0],
}

// ─── input validation ───────────────────────────────────────────────────────

describe('calculateScenario — input validation', () => {
  it('throws when pvKw is negative', () => {
    expect(() => calculateScenario(baselineWithPv, -1)).toThrow(
      'PV capacity cannot be negative'
    )
  })

  it('does NOT throw when pvKw is 0', () => {
    expect(() => calculateScenario(baselineWithPv, 0)).not.toThrow()
  })
})

// ─── pvKw = 0  (no new panels, scenario === baseline) ───────────────────────

describe('calculateScenario — pvKw = 0', () => {
  it('scenario consumption equals baseline consumption', () => {
    const { scenario } = calculateScenario(baselineWithPv, 0)
    expect(scenario.consumption).toEqual(baselineWithPv.consumption)
  })

  it('scenario pv_generation equals baseline pv_generation', () => {
    const { scenario } = calculateScenario(baselineWithPv, 0)
    expect(scenario.pv_generation).toEqual(baselineWithPv.pv_generation)
  })

  it('co2_savings_ton is 0 because nothing changed', () => {
    const { kpis } = calculateScenario(baselineWithPv, 0)
    expect(kpis.co2_savings_ton).toBe(0)
  })
})

// ─── pvKw > 0  (new panels added) ───────────────────────────────────────────

describe('calculateScenario — pvKw > 0', () => {
  it('scenario pv_generation is higher than baseline at every point', () => {
    const { scenario } = calculateScenario(baselineWithPv, 10)
    scenario.pv_generation.forEach((val, i) => {
      expect(val).toBeGreaterThanOrEqual(baselineWithPv.pv_generation[i])
    })
  })

  it('scenario consumption is lower than or equal to baseline at every point', () => {
    const { scenario } = calculateScenario(baselineWithPv, 10)
    scenario.consumption.forEach((val, i) => {
      expect(val).toBeLessThanOrEqual(baselineWithPv.consumption[i])
    })
  })

  it('consumption never drops below 20 % of baseline (floor guard)', () => {
    // Even with a huge PV system the floor is baseConsumption * 0.2
    const { scenario } = calculateScenario(baselineWithPv, 9999)
    scenario.consumption.forEach((val, i) => {
      const floor = baselineWithPv.consumption[i] * 0.2
      expect(val).toBeGreaterThanOrEqual(floor - 0.0001) // tiny float tolerance
    })
  })

  it('larger pvKw always produces more PV than smaller pvKw', () => {
    const { scenario: s5  } = calculateScenario(baselineWithPv, 5)
    const { scenario: s10 } = calculateScenario(baselineWithPv, 10)
    s10.pv_generation.forEach((val, i) => {
      expect(val).toBeGreaterThanOrEqual(s5.pv_generation[i])
    })
  })
})

// ─── KPI shape & types ───────────────────────────────────────────────────────

describe('calculateScenario — KPI output', () => {
  it('returns all three KPI fields', () => {
    const { kpis } = calculateScenario(baselineWithPv, 5)
    expect(kpis).toHaveProperty('total_consumption_kwh')
    expect(kpis).toHaveProperty('pv_coverage_pct')
    expect(kpis).toHaveProperty('co2_savings_ton')
  })

  it('total_consumption_kwh is a finite number', () => {
    const { kpis } = calculateScenario(baselineWithPv, 5)
    expect(Number.isFinite(kpis.total_consumption_kwh)).toBe(true)
  })

  it('pv_coverage_pct is between 0 and a reasonable upper bound', () => {
    const { kpis } = calculateScenario(baselineWithPv, 5)
    expect(kpis.pv_coverage_pct).toBeGreaterThanOrEqual(0)
  })

  it('co2_savings_ton is non-negative when pvKw > 0', () => {
    const { kpis } = calculateScenario(baselineWithPv, 5)
    expect(kpis.co2_savings_ton).toBeGreaterThanOrEqual(0)
  })
})

// ─── edge cases ──────────────────────────────────────────────────────────────

describe('calculateScenario — edge cases', () => {
  it('handles baseline with all-zero pv_generation (no sun hours)', () => {
    // When basePvGeneration = 0 the fallback branch (additionalPvPerHour * 0.1) runs
    const { scenario } = calculateScenario(baselineZeroPv, 10)
    scenario.pv_generation.forEach((val) => {
      expect(val).toBeGreaterThan(0)
    })
  })

  it('pv_coverage_pct is 0 when baseline consumption is all-zero', () => {
    const { kpis } = calculateScenario(baselineZeroConsumption, 5)
    expect(kpis.pv_coverage_pct).toBe(0)
  })

  it('handles a single-element baseline array', () => {
    const single = { consumption: [200], pv_generation: [10] }
    expect(() => calculateScenario(single, 5)).not.toThrow()
    const { scenario } = calculateScenario(single, 5)
    expect(scenario.consumption).toHaveLength(1)
    expect(scenario.pv_generation).toHaveLength(1)
  })

  it('output arrays have the same length as baseline', () => {
    const { scenario } = calculateScenario(baselineWithPv, 5)
    expect(scenario.consumption).toHaveLength(baselineWithPv.consumption.length)
    expect(scenario.pv_generation).toHaveLength(baselineWithPv.pv_generation.length)
  })
})
