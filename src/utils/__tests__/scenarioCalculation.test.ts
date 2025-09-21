import { describe, it, expect } from 'vitest'
import { calculateScenario, DEFAULT_CALCULATION_OPTIONS } from '../scenarioCalculation'
import type { Baseline } from '../../types'

describe('calculateScenario', () => {
  const mockBaseline: Baseline = {
    consumption: [120, 118, 115, 113, 112, 140, 160, 155],
    pv_generation: [0, 0, 0, 5, 15, 25, 20, 10],
  }

  it('should return baseline values when PV capacity is 0', () => {
    const result = calculateScenario(mockBaseline, 0)

    expect(result.scenario.consumption).toEqual(mockBaseline.consumption)
    expect(result.scenario.pv_generation).toEqual(mockBaseline.pv_generation)
    expect(result.kpis.total_consumption_kwh).toBe(1033)
    expect(result.kpis.pv_coverage_pct).toBeCloseTo(7.3, 1)
    expect(result.kpis.co2_savings_ton).toBe(0)
  })

  it('should reduce consumption and increase PV generation when PV capacity > 0', () => {
    const result = calculateScenario(mockBaseline, 10)

    // Consumption should be reduced
    expect(result.scenario.consumption.every((val, i) => val <= mockBaseline.consumption[i])).toBe(true)
    
    // PV generation should be increased
    expect(result.scenario.pv_generation.every((val, i) => val >= mockBaseline.pv_generation[i])).toBe(true)
    
    // Total consumption should be less than baseline
    const baselineTotal = mockBaseline.consumption.reduce((sum, val) => sum + val, 0)
    expect(result.kpis.total_consumption_kwh).toBeLessThan(baselineTotal)
    
    // PV coverage should be higher
    expect(result.kpis.pv_coverage_pct).toBeGreaterThan(7.3)
    
    // Should have some CO2 savings
    expect(result.kpis.co2_savings_ton).toBeGreaterThan(0)
  })

  it('should handle custom calculation options', () => {
    const customOptions = {
      hours_per_day: 6,
      self_consumption_share: 0.8,
      co2_emission_factor: 0.5,
    }

    const result = calculateScenario(mockBaseline, 10, customOptions)
    
    // Should return valid results with custom options
    expect(result.scenario.consumption).toHaveLength(mockBaseline.consumption.length)
    expect(result.scenario.pv_generation).toHaveLength(mockBaseline.pv_generation.length)
    expect(result.kpis.total_consumption_kwh).toBeGreaterThan(0)
    expect(result.kpis.pv_coverage_pct).toBeGreaterThanOrEqual(0)
    expect(result.kpis.co2_savings_ton).toBeGreaterThanOrEqual(0)
  })

  it('should throw error for negative PV capacity', () => {
    expect(() => calculateScenario(mockBaseline, -5)).toThrow('PV capacity cannot be negative')
  })

  it('should use default options when none provided', () => {
    const result = calculateScenario(mockBaseline, 5)
    
    // Should return reasonable values using defaults
    expect(result.scenario.consumption).toHaveLength(mockBaseline.consumption.length)
    expect(result.kpis.total_consumption_kwh).toBeGreaterThan(0)
    expect(result.kpis.pv_coverage_pct).toBeGreaterThanOrEqual(0)
  })

  it('should ensure consumption never goes below 20% of original', () => {
    // Test with very high PV capacity
    const result = calculateScenario(mockBaseline, 1000)
    
    result.scenario.consumption.forEach((consumption, i) => {
      const originalConsumption = mockBaseline.consumption[i]
      expect(consumption).toBeGreaterThanOrEqual(originalConsumption * 0.2)
    })
  })

  it('should calculate correct KPIs', () => {
    const result = calculateScenario(mockBaseline, 20)
    
    // Check KPI calculations
    const totalConsumption = result.scenario.consumption.reduce((sum, val) => sum + val, 0)
    const totalPvGeneration = result.scenario.pv_generation.reduce((sum, val) => sum + val, 0)
    const baselineTotal = mockBaseline.consumption.reduce((sum, val) => sum + val, 0)
    
    expect(result.kpis.total_consumption_kwh).toBeCloseTo(totalConsumption, 1)
    
    const expectedPvCoverage = (totalPvGeneration / baselineTotal) * 100
    expect(result.kpis.pv_coverage_pct).toBeCloseTo(expectedPvCoverage, 1)
    
    const consumptionSavings = baselineTotal - totalConsumption
    const expectedCo2Savings = (consumptionSavings * DEFAULT_CALCULATION_OPTIONS.co2_emission_factor) / 1000
    expect(result.kpis.co2_savings_ton).toBeCloseTo(expectedCo2Savings, 2)
  })
})
