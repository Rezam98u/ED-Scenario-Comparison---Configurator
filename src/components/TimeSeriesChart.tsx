import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Brush,
} from 'recharts'
import type { ChartDataPoint } from '../types'

interface TimeSeriesChartProps {
  data: ChartDataPoint[]
  className?: string
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{
    value: number
    dataKey: string
    color: string
    name: string
  }>
  label?: string
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (active && payload && payload.length && label) {
    const date = new Date(label)
    const formattedTime = date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    const formattedDate = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })

    return (
      <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
        <p className="font-medium text-gray-900">{`${formattedDate} ${formattedTime}`}</p>
        <div className="mt-2 space-y-1">
          {payload.map((entry, index) => {
            let label = ''
            if (entry.dataKey === 'baseline_consumption') label = 'Baseline Consumption'
            else if (entry.dataKey === 'scenario_consumption') label = 'Scenario Consumption'
            else if (entry.dataKey === 'baseline_pv') label = 'Baseline PV'
            else if (entry.dataKey === 'scenario_pv') label = 'Scenario PV'

            return (
              <p key={index} style={{ color: entry.color }} className="text-sm">
                {label}: {entry.value.toFixed(1)} kWh
              </p>
            )
          })}
        </div>
      </div>
    )
  }

  return null
}

const formatXAxisTick = (tickItem: string) => {
  const date = new Date(tickItem)
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function TimeSeriesChart({ data, className = '' }: TimeSeriesChartProps) {
  return (
    <div className={`bg-white rounded-lg shadow-sm border p-6 ${className}`}>
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Energy Consumption & PV Generation
        </h3>
        <p className="text-sm text-gray-600">
          Comparison of baseline vs scenario over time
        </p>
      </div>

      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis 
            dataKey="timestamp"
            tickFormatter={formatXAxisTick}
            angle={-45}
            textAnchor="end"
            height={60}
          />
          <YAxis 
            label={{ value: 'Energy (kWh)', angle: -90, position: 'insideLeft' }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          
          {/* Consumption Lines */}
          <Line
            type="monotone"
            dataKey="baseline_consumption"
            stroke="#6B7280"
            strokeWidth={2}
            name="Baseline Consumption"
            dot={false}
            strokeDasharray="5 5"
          />
          <Line
            type="monotone"
            dataKey="scenario_consumption"
            stroke="#DC2626"
            strokeWidth={2}
            name="Scenario Consumption"
            dot={false}
          />
          
          {/* PV Generation Lines */}
          <Line
            type="monotone"
            dataKey="baseline_pv"
            stroke="#059669"
            strokeWidth={2}
            name="Baseline PV"
            dot={false}
            strokeDasharray="5 5"
          />
          <Line
            type="monotone"
            dataKey="scenario_pv"
            stroke="#10B981"
            strokeWidth={2}
            name="Scenario PV"
            dot={false}
          />
          
          {/* Brush for zooming */}
          <Brush 
            dataKey="timestamp" 
            height={30}
            tickFormatter={formatXAxisTick}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
