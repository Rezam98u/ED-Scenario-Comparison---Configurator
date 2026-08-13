import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KpiCards } from '../components/KpiCards'

const mockKpis = {
  total_consumption_kwh: 1234.5,
  pv_coverage_pct: 45.2,
  co2_savings_ton: 0.321,
}

// ─── titles ──────────────────────────────────────────────────────────────────

describe('KpiCards — titles', () => {
  it('renders all three card titles', () => {
    render(<KpiCards kpis={mockKpis} />)
    expect(screen.getByText('Total Consumption')).toBeInTheDocument()
    expect(screen.getByText('PV Coverage')).toBeInTheDocument()
    expect(screen.getByText('CO₂ Savings')).toBeInTheDocument()
  })
})

// ─── units ───────────────────────────────────────────────────────────────────

describe('KpiCards — units', () => {
  it('renders kWh unit for Total Consumption', () => {
    render(<KpiCards kpis={mockKpis} />)
    expect(screen.getByText('kWh')).toBeInTheDocument()
  })

  it('renders % unit for PV Coverage', () => {
    render(<KpiCards kpis={mockKpis} />)
    expect(screen.getByText('%')).toBeInTheDocument()
  })

  it('renders t unit for CO₂ Savings', () => {
    render(<KpiCards kpis={mockKpis} />)
    expect(screen.getByText('t')).toBeInTheDocument()
  })
})

// ─── values ──────────────────────────────────────────────────────────────────

describe('KpiCards — values', () => {
  it('displays pv_coverage_pct value', () => {
    render(<KpiCards kpis={mockKpis} />)
    expect(screen.getByText('45.2')).toBeInTheDocument()
  })

  it('displays co2_savings_ton value', () => {
    render(<KpiCards kpis={mockKpis} />)
    expect(screen.getByText('0.321')).toBeInTheDocument()
  })

  // toLocaleString output varies by OS locale (e.g. "1,234.5" vs "1.234,5")
  // so we match the digits loosely with a regex instead of an exact string
  it('displays total_consumption_kwh value (locale-safe)', () => {
    render(<KpiCards kpis={mockKpis} />)
    expect(screen.getByText(/1.?234\.?5/)).toBeInTheDocument()
  })
})

// ─── edge cases ──────────────────────────────────────────────────────────────

describe('KpiCards — edge cases', () => {
  it('renders with all-zero KPIs without crashing', () => {
    const zeroKpis = { total_consumption_kwh: 0, pv_coverage_pct: 0, co2_savings_ton: 0 }
    render(<KpiCards kpis={zeroKpis} />)
    expect(screen.getAllByText('0')).toHaveLength(3)
  })

  it('renders with large values without crashing', () => {
    const bigKpis = { total_consumption_kwh: 999999, pv_coverage_pct: 100, co2_savings_ton: 999.999 }
    render(<KpiCards kpis={bigKpis} />)
    expect(screen.getByText('100')).toBeInTheDocument()
    expect(screen.getByText('999.999')).toBeInTheDocument()
  })
})
