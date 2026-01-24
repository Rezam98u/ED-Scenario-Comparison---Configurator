import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TimeSeriesChart } from './TimeSeriesChart'
import { KpiCards } from './KpiCards'
import { PvConfigurator } from './PvConfigurator'
import { ChartSkeleton, KpiCardSkeleton } from './LoadingSkeleton'
import { ErrorState } from './ErrorState'
import { ErrorBoundary } from './ErrorBoundary'
import { energyApi } from '../api/energyApi'
import type { EnergyApiResponse, ChartDataPoint, Scenario, Kpis, Baseline, ScenarioResult } from '../types/energy'

// Calculate scenario based on baseline and PV capacity
function calculateScenario(baseline: Baseline, pvKw: number): ScenarioResult {
  if (pvKw < 0) {
    throw new Error('PV capacity cannot be negative')
  }

  // Default calculation constants
  const hoursPerDay = 4 // Peak sun hours per day
  const selfConsumptionShare = 0.6 // 60% of PV generation is self-consumed
  const co2EmissionFactor = 0.4 // kg CO2 per kWh from grid

  // Calculate additional PV generation per hour
  const additionalPvPerHour = (pvKw * hoursPerDay) / 24

  const scenario: Scenario = {
    consumption: [],
    pv_generation: [],
  }

  // Process each timestamp
  for (let i = 0; i < baseline.consumption.length; i++) {
    const baseConsumption = baseline.consumption[i]
    const basePvGeneration = baseline.pv_generation[i]

    // Calculate new PV generation
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
        // Minimal generation during non-peak hours
        newPvGeneration = additionalPvPerHour * 0.1
      }
    }

    // Calculate consumption reduction
    const additionalPv = newPvGeneration - basePvGeneration
    const consumptionReduction = Math.min(
      additionalPv * selfConsumptionShare,
      baseConsumption * 0.8 // Max 80% reduction
    )

    const newConsumption = Math.max(
      baseConsumption - consumptionReduction,
      baseConsumption * 0.2 // Minimum 20% of original
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
  const co2SavingsTon = (consumptionSavings * co2EmissionFactor) / 1000

  const kpis: Kpis = {
    total_consumption_kwh: Math.round(totalScenarioConsumption * 10) / 10,
    pv_coverage_pct: Math.round(pvCoveragePct * 10) / 10,
    co2_savings_ton: Math.round(co2SavingsTon * 1000) / 1000,
  }

  return { scenario, kpis }
}

export function DashboardPage() {
  const [currentPvKw, setCurrentPvKw] = useState(10) // Default 10kW
  const [currentScenario, setCurrentScenario] = useState<Scenario | null>(null)
  const [currentKpis, setCurrentKpis] = useState<Kpis | null>(null)
  const [isApplying, setIsApplying] = useState(false)

  // Calculate date range (last 7 days)
  const endDate = new Date().toISOString().split('T')[0]
  const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  // Fetch energy data
  const {
    data,
    isLoading,
    error,
    refetch
  } = useQuery<EnergyApiResponse>({
    queryKey: ['energy-data', startDate, endDate],
    queryFn: () => energyApi.getEnergyData(startDate, endDate),
    staleTime: 5 * 60 * 1000, // 5 minutes cache
    retry: 1,
  })

  // Calculate scenario whenever data or PV config changes
  useEffect(() => {

    console.log(data);

    if (data) {
      const result = calculateScenario(data.baseline, currentPvKw)
      setCurrentScenario(result.scenario)
      setCurrentKpis(result.kpis)
    }
  }, [data, currentPvKw])

  // Handle PV configuration changes
  const handlePvConfigApply = async (newPvKw: number) => {
    if (!data) return

    setIsApplying(true)

    // Simulate a brief delay for better UX
    await new Promise(resolve => setTimeout(resolve, 300))

    setCurrentPvKw(newPvKw)
    setIsApplying(false)
  }

  // Prepare chart data
  const chartData: ChartDataPoint[] = useMemo(() => {
    if (!data || !currentScenario) return []

    return data.timestamps.map((timestamp: string, index: number) => ({
      timestamp,
      baseline_consumption: data.baseline.consumption[index],
      baseline_pv: data.baseline.pv_generation[index],
      scenario_consumption: currentScenario.consumption[index],
      scenario_pv: currentScenario.pv_generation[index],
    }))
  }, [data, currentScenario])

  const handleRetry = () => refetch()



  // React Query handles all loading/error states
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Energy Dashboard
            </h1>
            <p className="text-gray-600">
              Scenario Comparison & Configurator
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-3 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <KpiCardSkeleton />
                <KpiCardSkeleton />
                <KpiCardSkeleton />
              </div>
              <ChartSkeleton />
            </div>
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg shadow-sm border p-6">
                <div className="animate-pulse">
                  <div className="h-6 bg-gray-200 rounded mb-4"></div>
                  <div className="space-y-3">
                    <div className="h-4 bg-gray-200 rounded"></div>
                    <div className="h-2 bg-gray-200 rounded"></div>
                    <div className="h-10 bg-gray-200 rounded"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Energy Dashboard
            </h1>
            <p className="text-gray-600">
              Scenario Comparison & Configurator
            </p>
          </div>
          <ErrorState error={error} onRetry={handleRetry} />
        </div>
      </div>
    )
  }

  if (!data || !currentKpis) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Energy Dashboard
          </h1>
          <p className="text-gray-600">
            Compare baseline vs scenario energy consumption and PV generation
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main content area */}
          <div className="lg:col-span-3 space-y-6">
            {/* KPI Cards */}
            <ErrorBoundary context="KpiCards">
              <KpiCards kpis={currentKpis} />
            </ErrorBoundary>

            {/* Chart */}
            <ErrorBoundary context="TimeSeriesChart">
              <TimeSeriesChart data={chartData} />
            </ErrorBoundary>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <ErrorBoundary context="PvConfigurator">
              <PvConfigurator
                currentPvKw={currentPvKw}
                onApply={handlePvConfigApply}
                isLoading={isApplying}
              />
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </div>
  )
}
