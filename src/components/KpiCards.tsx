import React from 'react'
import type { Kpis } from '../types/energy'

interface KpiCardsProps {
  kpis: Kpis
}

// we use Conditional type to enforces that percentage/tonne units must have number values
// and formatted units (like kWh) must have string values
type KpiCardProps<U extends string = string> = U extends '%' | 't'
  ? { title: string; value: number; unit: U; change?: number }
  : { title: string; value: string; unit: U; change?: number }


function KpiCard<U extends string>({ title, value, unit, change }: KpiCardProps<U>) {
  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      <h3 className="text-sm font-medium text-gray-600 mb-2">{title}</h3>
      <div className="flex items-baseline justify-between">
        <div>
          <span className="text-2xl font-bold text-gray-900">{value}</span>
          <span className="ml-1 text-sm text-gray-500">{unit}</span>
        </div>
        {change !== undefined && (
          <div className={`text-sm font-medium ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {change >= 0 ? '+' : ''}{change.toFixed(1)}%
          </div>
        )}
      </div>
    </div>
  )
}

export const KpiCards = React.memo(({ kpis }: KpiCardsProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <KpiCard
        title="Total Consumption"
        value={kpis.total_consumption_kwh.toLocaleString()}
        unit="kWh"
      />
      <KpiCard
        title="PV Coverage"
        value={kpis.pv_coverage_pct}
        unit="%"
      />
      <KpiCard
        title="CO₂ Savings"
        value={kpis.co2_savings_ton}
        unit="t"
      />
    </div>
  )
})
