import { describe, it, expect } from 'vitest'
import { formatDay, peakText } from '../components/AnalysisSection'

describe('AnalysisSection helpers', () => {
  it('formats the peak hours as text', () => {
    const analysis = { daily: [], hourlyProfile: [], peakConsumptionHour: 18, peakPvHour: 12 }
    expect(peakText(analysis)).toBe('Verbrauchsspitze: 18 Uhr (UTC), PV-Spitze: 12 Uhr (UTC)')
  })

  it('shows a dash when there is no peak', () => {
    const analysis = { daily: [], hourlyProfile: [], peakConsumptionHour: null, peakPvHour: null }
    expect(peakText(analysis)).toBe('Verbrauchsspitze: –, PV-Spitze: –')
  })

  it('formats a UTC day without shifting it', () => {
    expect(formatDay('2025-01-01')).toBe('01.01.')
  })
})
