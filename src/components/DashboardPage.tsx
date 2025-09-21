import { useState, useEffect, useMemo } from 'react'
import { TimeSeriesChart } from './TimeSeriesChart'
import { KpiCards } from './KpiCards'
import { PvConfigurator } from './PvConfigurator'
import { ChartSkeleton, KpiCardSkeleton } from './LoadingSkeleton'
import { ErrorState } from './ErrorState'
import { ErrorBoundary } from './ErrorBoundary'
import { energyApi } from '../services'
import { calculateScenario, logger } from '../utils'
import type { EnergyApiResponse, ChartDataPoint, Scenario, Kpis } from '../types'

export function DashboardPage() {
  const [data, setData] = useState<EnergyApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [currentPvKw, setCurrentPvKw] = useState(10) // Default 10kW
  const [isApplying, setIsApplying] = useState(false)

  // Current scenario and KPIs based on PV configuration
  const [currentScenario, setCurrentScenario] = useState<Scenario | null>(null)
  const [currentKpis, setCurrentKpis] = useState<Kpis | null>(null)

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        setError(null)
        
        logger.info('Starting data fetch', 'DashboardPage')
        
        // Fetch data for the past week
        const endDate = new Date().toISOString().split('T')[0]
        const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        
        logger.debug(`Fetching energy data from ${startDate} to ${endDate}`, 'DashboardPage')
        
        const response = await energyApi.getEnergyData(startDate, endDate)
        setData(response)
        
        logger.info('Data fetch successful', 'DashboardPage', { 
          dataPoints: response.timestamps.length,
          baselineConsumption: response.baseline.consumption.reduce((sum, val) => sum + val, 0)
        })
        
        // Calculate initial scenario
        const result = calculateScenario(response.baseline, currentPvKw)
        setCurrentScenario(result.scenario)
        setCurrentKpis(result.kpis)
        
        logger.debug('Initial scenario calculated', 'DashboardPage', {
          pvKw: currentPvKw,
          consumption: result.kpis.total_consumption_kwh,
          pvCoverage: result.kpis.pv_coverage_pct
        })
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to fetch data')
        logger.trackError(error, 'DashboardPage', { currentPvKw })
        setError(error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [currentPvKw])

  // Handle PV configuration changes
  const handlePvConfigApply = async (newPvKw: number) => {
    if (!data) return

    setIsApplying(true)
    
    try {
      logger.info(`Applying new PV configuration: ${newPvKw} kW`, 'DashboardPage')
      
      // Simulate some processing time
      await new Promise(resolve => setTimeout(resolve, 500))
      
      const result = calculateScenario(data.baseline, newPvKw)
      setCurrentScenario(result.scenario)
      setCurrentKpis(result.kpis)
      setCurrentPvKw(newPvKw)
      
      logger.info('PV configuration applied successfully', 'DashboardPage', {
        newPvKw,
        newConsumption: result.kpis.total_consumption_kwh,
        newPvCoverage: result.kpis.pv_coverage_pct,
        co2Savings: result.kpis.co2_savings_ton
      })
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to calculate scenario')
      logger.trackError(error, 'DashboardPage', { newPvKw, hasData: !!data })
      setError(error)
    } finally {
      setIsApplying(false)
    }
  }

  // Prepare chart data
  const chartData: ChartDataPoint[] = useMemo(() => {
    if (!data || !currentScenario) return []

    return data.timestamps.map((timestamp, index) => ({
      timestamp,
      baseline_consumption: data.baseline.consumption[index],
      baseline_pv: data.baseline.pv_generation[index],
      scenario_consumption: currentScenario.consumption[index],
      scenario_pv: currentScenario.pv_generation[index],
    }))
  }, [data, currentScenario])

  const handleRetry = () => {
    setError(null)
    // Trigger re-fetch by changing a dependency
    setCurrentPvKw(prev => prev)
  }

  if (loading) {
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
