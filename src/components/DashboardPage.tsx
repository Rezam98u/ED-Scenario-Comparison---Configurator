import { useState, useEffect, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { TimeSeriesChart } from './TimeSeriesChart'
import { KpiCards } from './KpiCards'
import { PvConfigurator } from './PvConfigurator'
import { ChartSkeleton, KpiCardSkeleton } from './LoadingSkeleton'
import { ErrorState } from './ErrorState'
import { ErrorBoundary } from './ErrorBoundary'
import { energyApi } from '../api/energyApi'
import { calculateScenario } from '../utils/calculateScenario'
import type { EnergyApiResponse, ChartDataPoint, Scenario, Kpis, SavedScenario } from '../types/energy'

// ─── Small local components ──────────────────────────────────────────────────

function PageHeader({ subtitle }: { subtitle: string }) {
  return (
    <div className="mb-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Energy Dashboard</h1>
      <p className="text-gray-600">{subtitle}</p>
    </div>
  )
}

interface SaveScenarioCardProps {
  pvKw: number
  kpis: Kpis | null
  isPending: boolean
  isError: boolean
  isSuccess: boolean
  onSave: () => void
}

function SaveScenarioCard({ pvKw, kpis, isPending, isError, isSuccess, onSave }: SaveScenarioCardProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Save Scenario</h3>
      <button
        onClick={onSave}
        disabled={isPending || !kpis}
        className={`w-full py-2 px-4 rounded-md font-medium transition-colors ${!isPending && kpis
          ? 'bg-green-600 text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2'
          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
      >
        {isPending ? 'Saving...' : `Save ${pvKw} kW Scenario`}
      </button>
      {isError && <p className="text-red-500 text-sm mt-2">Failed to save. Please try again.</p>}
      {isSuccess && <p className="text-green-600 text-sm mt-2">Scenario saved!</p>}
    </div>
  )
}

function SavedScenariosList({ scenarios }: { scenarios: SavedScenario[] }) {
  if (scenarios.length === 0) return null

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Saved Scenarios ({scenarios.length})
      </h3>
      <div className="space-y-2">
        {scenarios.map((s) => (
          <div
            key={s.id}
            className={`p-3 rounded-md border text-sm ${s.id.startsWith('optimistic-')
              ? 'border-dashed border-blue-300 bg-blue-50 opacity-70'
              : 'border-gray-200 bg-gray-50'
              }`}
          >
            <div className="font-medium text-gray-800">{s.pvKw} kW</div>
            <div className="text-gray-500 text-xs mt-1">
              Coverage: {s.kpis.pv_coverage_pct}% · CO₂: {s.kpis.co2_savings_ton} t
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const [currentPvKw, setCurrentPvKw] = useState(10)
  const [currentScenario, setCurrentScenario] = useState<Scenario | null>(null)
  const [currentKpis, setCurrentKpis] = useState<Kpis | null>(null)

  const { data, isLoading, error, refetch } = useQuery<EnergyApiResponse>({
    queryKey: ['energy-data'],
    queryFn: () => energyApi.getEnergyData(),
  })

  const queryClient = useQueryClient()

  const { data: savedScenarios = [] } = useQuery<SavedScenario[]>({
    queryKey: ['saved-scenarios'],
    queryFn: () => energyApi.getSavedScenarios(),
  })

  const saveScenarioMutation = useMutation({
    mutationFn: () => energyApi.saveScenario(currentPvKw, currentKpis!),

    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['saved-scenarios'] })
      const previous = queryClient.getQueryData<SavedScenario[]>(['saved-scenarios'])

      const optimistic: SavedScenario = {
        id: `optimistic-${Date.now()}`,
        pvKw: currentPvKw,
        kpis: currentKpis!,
        savedAt: new Date().toISOString(),
      }
      queryClient.setQueryData<SavedScenario[]>(['saved-scenarios'], (old = []) => [optimistic, ...old])

      return { previous }
    },

    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(['saved-scenarios'], context.previous)
      }
    },

    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['saved-scenarios'] }) }

  })

  useEffect(() => {
    if (data) {
      const result = calculateScenario(data.baseline, currentPvKw)
      setCurrentScenario(result.scenario)
      setCurrentKpis(result.kpis)
    }
  }, [data, currentPvKw])

  const handlePvConfigApply = useCallback((newPvKw: number) => {
    setCurrentPvKw(newPvKw)
  }, [])

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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <PageHeader subtitle="Scenario Comparison & Configurator" />
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
          <PageHeader subtitle="Scenario Comparison & Configurator" />
          <ErrorState error={error} onRetry={() => refetch()} />
        </div>
      </div>
    )
  }

  if (!data || !currentKpis) return null

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <PageHeader subtitle="Compare baseline vs scenario energy consumption and PV generation" />

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3 space-y-6">
            <ErrorBoundary>
              <KpiCards kpis={currentKpis} />
            </ErrorBoundary>
            <ErrorBoundary>
              <TimeSeriesChart data={chartData} />
            </ErrorBoundary>
          </div>

          <div className="lg:col-span-1 space-y-4">
            <ErrorBoundary>
              <PvConfigurator
                currentPvKw={currentPvKw}
                onApply={handlePvConfigApply}
              />
            </ErrorBoundary>

            <SaveScenarioCard
              pvKw={currentPvKw}
              kpis={currentKpis}
              isPending={saveScenarioMutation.isPending}
              isError={saveScenarioMutation.isError}
              isSuccess={saveScenarioMutation.isSuccess}
              onSave={() => saveScenarioMutation.mutate()}
            />

            <SavedScenariosList scenarios={savedScenarios} />
          </div>
        </div>
      </div>
    </div>
  )
}
