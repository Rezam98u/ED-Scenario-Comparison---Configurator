import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SavedScenariosList } from '../components/DashboardPage'
import type { DatasetSummary, SavedScenario } from '../types/energy'

const dataset = (id: string, start: string, end: string): DatasetSummary => ({
  id, start, end, label: 'open-meteo', params: null, createdAt: '2026-10-24T12:00:00.000Z',
})
const DATASETS = [dataset('aug', '2026-08-01', '2026-08-07'), dataset('oct', '2026-10-01', '2026-10-07')]

const scenario = (id: string, datasetId: string, coverage: number): SavedScenario => ({
  id,
  pvKw: 10,
  kpis: { total_consumption_kwh: 1300, pv_coverage_pct: coverage, co2_savings_ton: 0.02 },
  savedAt: '2026-10-24T12:00:00.000Z',
  datasetId,
})

describe('SavedScenariosList — periods', () => {
  it('labels each scenario with its period, so the same kW can be compared across weeks', () => {
    render(<SavedScenariosList scenarios={[scenario('a', 'oct', 25.8), scenario('b', 'aug', 33.6)]} datasets={DATASETS} />)
    expect(screen.getByText('· 1 Oct – 7 Oct 2026')).toBeInTheDocument()
    expect(screen.getByText('· 1 Aug – 7 Aug 2026')).toBeInTheDocument()
    expect(screen.getByText(/Coverage: 25.8%/)).toBeInTheDocument()
    expect(screen.getByText(/Coverage: 33.6%/)).toBeInTheDocument()
  })

  it('shows no label while the period list is not loaded', () => {
    render(<SavedScenariosList scenarios={[scenario('a', 'oct', 25.8)]} datasets={[]} />)
    expect(screen.getByText('Saved Scenarios (1)')).toBeInTheDocument()
    expect(screen.queryByText(/Oct/)).not.toBeInTheDocument()
  })
})
