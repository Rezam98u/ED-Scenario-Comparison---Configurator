import React, { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { energyApi, type DatasetId } from '../api/energyApi'
import type { DatasetSummary } from '../types/energy'

// Same limits as POST /api/energy/datasets, so most mistakes are caught before a request
export const MAX_PERIOD_DAYS = 31

const DAY_MS = 24 * 60 * 60 * 1000

/** "YYYY-MM-DD" of yesterday in UTC: Open-Meteo has data up to yesterday. */
export function yesterdayUtc(now: Date = new Date()): string {
  return new Date(now.getTime() - DAY_MS).toISOString().slice(0, 10)
}

/** Why the period can't be loaded, or null when it is fine. Dates are "YYYY-MM-DD". */
export function periodError(start: string, end: string, yesterday: string): string | null {
  if (!start || !end) return 'Choose a start and an end date.'
  if (end < start) return 'The end date must not be before the start date.'
  const days = (Date.parse(end) - Date.parse(start)) / DAY_MS + 1
  if (days > MAX_PERIOD_DAYS) return `A period can be at most ${MAX_PERIOD_DAYS} days.`
  if (end > yesterday) return `Weather data is only available up to yesterday (${yesterday}).`
  return null
}

// The days are UTC days, so format them in UTC (otherwise they could shift a day)
const dayFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const yearFormat = new Intl.DateTimeFormat('en-GB', { year: 'numeric', timeZone: 'UTC' })

/** "1 Oct – 7 Oct 2026" */
export function formatPeriod(start: string, end: string): string {
  const s = new Date(`${start}T00:00:00Z`)
  const e = new Date(`${end}T00:00:00Z`)
  const startYear = yearFormat.format(s) === yearFormat.format(e) ? '' : ` ${yearFormat.format(s)}`
  return `${dayFormat.format(s)}${startYear} – ${dayFormat.format(e)} ${yearFormat.format(e)}`
}

interface PeriodPickerProps {
  datasets: DatasetSummary[]
  selectedId: DatasetId
  onSelect: (id: DatasetId) => void
}

/** Choose one of the imported periods, or load a new one from Open-Meteo. */
export const PeriodPicker = React.memo(function ({ datasets, selectedId, onSelect }: PeriodPickerProps) {
  const queryClient = useQueryClient()
  const yesterday = yesterdayUtc()
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  const defaultId = datasets[0]?.id ?? null
  // Default first, then the other periods by date (the API lists them by import time)
  const options = [datasets[0], ...datasets.slice(1).sort((a, b) => a.start.localeCompare(b.start))]
    .filter(Boolean)
  // The first dataset is the default; selecting it means "no id" (a clean URL)
  const toSelection = (id: string): DatasetId => (id === defaultId ? null : id)

  const importMutation = useMutation({
    mutationFn: () => energyApi.importDataset(start, end),
    onSuccess: async (dataset) => {
      await queryClient.invalidateQueries({ queryKey: ['datasets'] })
      onSelect(toSelection(dataset.id))
      setStart('')
      setEnd('')
    },
  })

  const inputError = start || end ? periodError(start, end, yesterday) : null
  const canLoad = !!start && !!end && inputError === null && !importMutation.isPending

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Period</h3>

      <label htmlFor="period-select" className="block text-sm font-medium text-gray-700 mb-2">
        Show data for
      </label>
      <select
        id="period-select"
        value={selectedId ?? defaultId ?? ''}
        onChange={(e) => onSelect(toSelection(e.target.value))}
        className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {options.map((d) => (
          <option key={d.id} value={d.id}>
            {formatPeriod(d.start, d.end)}{d.id === defaultId ? ' (default)' : ''}
          </option>
        ))}
      </select>

      <form
        className="mt-5 space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (canLoad) importMutation.mutate()
        }}
      >
        <p className="text-sm font-medium text-gray-700">Load another period</p>
        <div className="space-y-2">
          <label className="text-xs text-gray-500">
            From
            <input
              type="date"
              value={start}
              max={yesterday}
              onChange={(e) => setStart(e.target.value)}
              className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm text-gray-900"
            />
          </label>
          <label className="text-xs text-gray-500">
            To
            <input
              type="date"
              value={end}
              min={start || undefined}
              max={yesterday}
              onChange={(e) => setEnd(e.target.value)}
              className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm text-gray-900"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={!canLoad}
          className={`w-full py-2 px-4 rounded-md font-medium transition-colors ${canLoad
            ? 'bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
        >
          {importMutation.isPending ? 'Loading weather data...' : 'Load period'}
        </button>
        {inputError && <p className="text-amber-700 text-xs">{inputError}</p>}
        {importMutation.isError && (
          <p className="text-red-500 text-sm">{importMutation.error.message}</p>
        )}
        <p className="text-xs text-gray-500">
          Real PV from Open-Meteo weather data; consumption from a standard load profile. Up to {MAX_PERIOD_DAYS} days.
        </p>
      </form>
    </div>
  )
})
