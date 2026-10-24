// Labels for the charts (TimeSeriesChart and AnalysisSection)

import type { EnergyAnalysis } from '../types/energy'

export const formatXAxisTick = (tickItem: string) => {
  const date = new Date(tickItem)
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

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
