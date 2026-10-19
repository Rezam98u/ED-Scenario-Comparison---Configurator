import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { energyApi } from '../api/energyApi'
import { ChartSkeleton } from './LoadingSkeleton'
import { ErrorState } from './ErrorState'
import type { EnergyAnalysis } from '../types/energy'

// Same colors as TimeSeriesChart, so consumption and PV look the same everywhere
const CONSUMPTION_COLOR = '#DC2626'
const PV_COLOR = '#059669'

// "2025-01-01" is a UTC day, so format it in UTC (otherwise it could shift a day)
export const formatDay = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  })

export const formatHour = (hour: number) => `${hour} Uhr`

export function peakText(analysis: EnergyAnalysis): string {
  const show = (hour: number | null) => (hour === null ? '–' : `${formatHour(hour)} (UTC)`)
  return `Verbrauchsspitze: ${show(analysis.peakConsumptionHour)}, PV-Spitze: ${show(analysis.peakPvHour)}`
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">{title}</h3>
        <p className="text-sm text-gray-600">{subtitle}</p>
      </div>
      {children}
    </div>
  )
}

export function AnalysisSection() {
  const { data, isLoading, error, refetch } = useQuery<EnergyAnalysis>({
    queryKey: ['energy-analysis'],
    queryFn: () => energyApi.getAnalysis(),
  })

  return (
    <section className="mt-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-1">Analyse</h2>

      {isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
      )}

      {error && <ErrorState error={error} onRetry={() => refetch()} className="mt-4" />}

      {data && (
        <>
          <p className="text-gray-600 mb-4">{peakText(data)}</p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard
              title="Tägliche Autarkie"
              subtitle="Anteil des Verbrauchs, der direkt durch PV gedeckt wird (UTC-Tage)"
            >
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.daily} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={formatDay} />
                  <YAxis unit=" %" />
                  <Tooltip
                    labelFormatter={(date) => formatDay(String(date))}
                    formatter={(value) => [`${value} %`, 'Autarkie']}
                    cursor={{ fill: '#F3F4F6' }}
                  />
                  <Bar dataKey="autarky_pct" name="Autarkie" fill={PV_COLOR} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Durchschnittlicher Tagesverlauf"
              subtitle="Mittlerer Verbrauch und PV-Erzeugung je Stunde (UTC)"
            >
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={data.hourlyProfile} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" tickFormatter={(h) => `${h}`} />
                  <YAxis unit=" kWh" width={70} />
                  <Tooltip
                    labelFormatter={(hour) => `${formatHour(Number(hour))} (UTC)`}
                    formatter={(value, name) => [`${value} kWh`, name]}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="consumption_kwh"
                    name="Verbrauch"
                    stroke={CONSUMPTION_COLOR}
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="pv_kwh"
                    name="PV-Erzeugung"
                    stroke={PV_COLOR}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </>
      )}
    </section>
  )
}
