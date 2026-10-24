import { useState, useMemo, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { TimeSeriesChart } from './TimeSeriesChart'
import { KpiCards } from './KpiCards'
import { PvConfigurator } from './PvConfigurator'
import { ChartSkeleton, KpiCardSkeleton } from './LoadingSkeleton'
import { ErrorState } from './ErrorState'
import { ErrorBoundary } from './ErrorBoundary'
import { AnalysisSection } from './AnalysisSection'
import { ChatPanel } from './ChatPanel'
import { PeriodPicker, formatPeriod } from './PeriodPicker'
import { energyApi, type DatasetId } from '../api/energyApi'
import type {
  DatasetSummary, EnergyApiResponse, ChartDataPoint, Kpis, SavedScenario, ScenarioResult,
} from '../types/energy'


// ─── Small local components ──────────────────────────────────────────────────

// avoid repeating the same header JSX in 3 places
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

function PeriodBanner({ dataset, onReset }: { dataset: DatasetSummary; onReset: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
      <span>
        Showing <strong>{formatPeriod(dataset.start, dataset.end)}</strong> (not the default period)
      </span>
      <button onClick={onReset} className="font-medium text-blue-700 hover:underline">
        Back to default
      </button>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

// The chosen period is kept in the URL (?dataset=<id>), so a reload or a shared
// link shows the same period. No parameter = the default period.
function readDatasetFromUrl(): DatasetId {
  return new URLSearchParams(window.location.search).get('dataset')
}

function writeDatasetToUrl(datasetId: DatasetId) {
  const url = new URL(window.location.href)
  if (datasetId === null) url.searchParams.delete('dataset')
  else url.searchParams.set('dataset', datasetId)
  window.history.replaceState(null, '', url)
}

export function DashboardPage() {
  const [currentPvKw, setCurrentPvKw] = useState(10)
  const [datasetId, setDatasetId] = useState<DatasetId>(readDatasetFromUrl)

  useEffect(() => { writeDatasetToUrl(datasetId) }, [datasetId])

  const { data: datasets } = useQuery<DatasetSummary[]>({
    queryKey: ['datasets'],
    queryFn: () => energyApi.getDatasets(),
  })

  // A period from an old link may no longer exist: fall back to the default
  useEffect(() => {
    if (datasets && datasetId !== null && !datasets.some((d) => d.id === datasetId)) {
      setDatasetId(null)
    }
  }, [datasets, datasetId])

  const { data, isLoading, error, refetch } = useQuery<EnergyApiResponse>({
    queryKey: ['energy-data', datasetId],
    queryFn: () => energyApi.getEnergyData(datasetId),
  })

  // The scenario is calculated by the backend (POST /api/energy/calculate).
  // pvKw is part of the query key, so each value is cached: going back to a pvKw
  // that was already calculated needs no new request.
  const scenarioQuery = useQuery<ScenarioResult>({
    queryKey: ['scenario', datasetId, currentPvKw],
    queryFn: () => energyApi.calculateScenario(currentPvKw, datasetId),
    // While a new pvKw is calculated, keep showing the previous result instead of
    // the full-page skeleton. Only within the same period: another period has
    // other timestamps, so its old scenario must not be shown.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === datasetId ? keepPreviousData(previous) : undefined,
  })

  const selectedDataset = datasetId === null ? null : datasets?.find((d) => d.id === datasetId) ?? null

  const currentScenario = scenarioQuery.data?.scenario ?? null
  const currentKpis = scenarioQuery.data?.kpis ?? null
  // Placeholder KPIs belong to the previous pvKw, so they must not be saved with the new one
  const savableKpis = scenarioQuery.isPlaceholderData ? null : currentKpis

  const queryClient = useQueryClient()

  const { data: savedScenarios = [] } = useQuery<SavedScenario[]>({
    queryKey: ['saved-scenarios'],
    queryFn: () => energyApi.getSavedScenarios(),
  })

  // as we checked savableKpis and Save button is disabled when kpis is null (line 41)
  // so we can use ! (Assertion) to tell TS that it's not null (skip)
  const saveScenarioMutation = useMutation({
    mutationFn: () => energyApi.saveScenario(currentPvKw, savableKpis!),

    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['saved-scenarios'] })
      const previous = queryClient.getQueryData<SavedScenario[]>(['saved-scenarios'])

      const optimistic: SavedScenario = {
        id: `optimistic-${Date.now()}`,
        pvKw: currentPvKw,
        kpis: savableKpis!,
        savedAt: new Date().toISOString(),
      }
      queryClient.setQueryData<SavedScenario[]>(
        ['saved-scenarios'],
        (old = []) => [optimistic, ...old]
      )
      return { previous }
    },

    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(['saved-scenarios'], context.previous)
      }
    },

    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['saved-scenarios'] }) }

  })

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

  if (isLoading || scenarioQuery.isLoading) {
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

  const pageError = error ?? scenarioQuery.error
  if (pageError) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <PageHeader subtitle="Scenario Comparison & Configurator" />
          <ErrorState
            error={pageError}
            onRetry={() => (error ? refetch() : scenarioQuery.refetch())}
          />
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
            {selectedDataset && (
              <PeriodBanner dataset={selectedDataset} onReset={() => setDatasetId(null)} />
            )}
            <ErrorBoundary>
              <KpiCards kpis={currentKpis} />
            </ErrorBoundary>
            <ErrorBoundary>
              <TimeSeriesChart data={chartData} />
            </ErrorBoundary>
          </div>

          <div className="lg:col-span-1 space-y-4">

            {datasets && datasets.length > 0 && (
              <ErrorBoundary>
                <PeriodPicker datasets={datasets} selectedId={datasetId} onSelect={setDatasetId} />
              </ErrorBoundary>
            )}

            <ErrorBoundary>
              <PvConfigurator currentPvKw={currentPvKw} onApply={handlePvConfigApply} />
            </ErrorBoundary>

            <SaveScenarioCard
              pvKw={currentPvKw}
              kpis={savableKpis}
              isPending={saveScenarioMutation.isPending}
              isError={saveScenarioMutation.isError}
              isSuccess={saveScenarioMutation.isSuccess}
              onSave={() => saveScenarioMutation.mutate()}
            />

            <SavedScenariosList scenarios={savedScenarios} />

            <ErrorBoundary>
              <ChatPanel />
            </ErrorBoundary>
          </div>
        </div>

        <ErrorBoundary>
          <AnalysisSection datasetId={datasetId} />
        </ErrorBoundary>
      </div>
    </div>
  )
}
