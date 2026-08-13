import { describe, it, expect } from 'vitest'
import { formatXAxisTick } from '../components/TimeSeriesChart'

// Timestamps without 'Z' are parsed as local time by JavaScript,
// so toLocaleTimeString returns the same hour/minute regardless of the machine's timezone.
describe('formatXAxisTick', () => {
  it('formats a morning timestamp to HH:MM (24h)', () => {
    expect(formatXAxisTick('2024-01-01T08:05:00')).toBe('08:05')
  })

  it('formats an afternoon timestamp correctly (no AM/PM)', () => {
    expect(formatXAxisTick('2024-01-01T14:30:00')).toBe('14:30')
  })

  it('formats midnight as 00:00', () => {
    expect(formatXAxisTick('2024-01-01T00:00:00')).toBe('00:00')
  })

  it('formats end-of-day as 23:59', () => {
    expect(formatXAxisTick('2024-01-01T23:59:00')).toBe('23:59')
  })

  it('zero-pads single-digit hours and minutes', () => {
    // hour 9, minute 7 → must be "09:07" not "9:7"
    expect(formatXAxisTick('2024-01-01T09:07:00')).toBe('09:07')
  })
})
