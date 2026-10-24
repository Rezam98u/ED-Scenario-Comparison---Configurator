import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PeriodPicker, formatPeriod, periodError, yesterdayUtc } from '../components/PeriodPicker'
import type { DatasetSummary } from '../types/energy'

const dataset = (id: string, start: string, end: string): DatasetSummary => ({
  id, start, end, label: 'open-meteo', params: null, createdAt: '2026-10-24T12:00:00.000Z',
})
const AUGUST = dataset('aug', '2026-08-01', '2026-08-07')
const OCTOBER = dataset('oct', '2026-10-01', '2026-10-07')

function renderPicker(selectedId: string | null = null) {
  const onSelect = vi.fn()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PeriodPicker datasets={[AUGUST, OCTOBER]} selectedId={selectedId} onSelect={onSelect} />
    </QueryClientProvider>,
  )
  return onSelect
}

afterEach(() => { vi.unstubAllGlobals() })

// ─── helpers ─────────────────────────────────────────────────────────────────

describe('periodError', () => {
  const yesterday = '2026-10-23'

  it('accepts a valid week', () => {
    expect(periodError('2026-10-01', '2026-10-07', yesterday)).toBeNull()
  })

  it('accepts exactly 31 days and a period ending yesterday', () => {
    expect(periodError('2026-09-23', '2026-10-23', yesterday)).toBeNull()
  })

  it.each([
    ['', '2026-10-07', 'Choose a start and an end date.'],
    ['2026-10-07', '2026-10-01', 'The end date must not be before the start date.'],
    ['2026-08-01', '2026-09-30', 'A period can be at most 31 days.'],
    ['2026-10-20', '2026-10-24', 'Weather data is only available up to yesterday (2026-10-23).'],
  ])('rejects %s – %s', (start, end, message) => {
    expect(periodError(start, end, yesterday)).toBe(message)
  })
})

describe('formatPeriod', () => {
  it('shows the year once when both days are in the same year', () => {
    expect(formatPeriod('2026-10-01', '2026-10-07')).toBe('1 Oct – 7 Oct 2026')
  })

  it('shows both years across New Year', () => {
    expect(formatPeriod('2025-12-29', '2026-01-04')).toBe('29 Dec 2025 – 4 Jan 2026')
  })
})

describe('yesterdayUtc', () => {
  it('uses the UTC day, not the local one', () => {
    expect(yesterdayUtc(new Date('2026-10-24T00:30:00Z'))).toBe('2026-10-23')
  })
})

// ─── component ───────────────────────────────────────────────────────────────

describe('PeriodPicker', () => {
  it('lists the periods and marks the first as default', () => {
    renderPicker()
    expect(screen.getByRole('option', { name: '1 Aug – 7 Aug 2026 (default)' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '1 Oct – 7 Oct 2026' })).toBeInTheDocument()
  })

  it('keeps the default first and sorts the other periods by date', () => {
    const onSelect = vi.fn()
    const september = dataset('sep', '2026-09-01', '2026-09-07')
    render(
      <QueryClientProvider client={new QueryClient()}>
        <PeriodPicker datasets={[AUGUST, OCTOBER, september]} selectedId={null} onSelect={onSelect} />
      </QueryClientProvider>,
    )
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      '1 Aug – 7 Aug 2026 (default)', '1 Sept – 7 Sept 2026', '1 Oct – 7 Oct 2026',
    ])
  })

  it('selects a period by id, and the default as null', () => {
    const onSelect = renderPicker('oct')
    const select = screen.getByLabelText('Show data for')
    expect(select).toHaveValue('oct')

    fireEvent.change(select, { target: { value: 'aug' } })
    expect(onSelect).toHaveBeenLastCalledWith(null)
    fireEvent.change(select, { target: { value: 'oct' } })
    expect(onSelect).toHaveBeenLastCalledWith('oct')
  })

  it('keeps "Load period" disabled until the dates are valid', () => {
    renderPicker()
    const button = screen.getByRole('button', { name: 'Load period' })
    expect(button).toBeDisabled()

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-08-01' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-09-30' } })
    expect(button).toBeDisabled()
    expect(screen.getByText('A period can be at most 31 days.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-08-07' } })
    expect(button).toBeEnabled()
  })

  it('imports the period and switches to it', async () => {
    const september = dataset('sep', '2026-09-01', '2026-09-07')
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(september), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const onSelect = renderPicker()

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-09-01' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-09-07' } })
    fireEvent.click(screen.getByRole('button', { name: 'Load period' }))

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('sep'))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/api\/energy\/datasets$/)
    expect(JSON.parse(init.body)).toEqual({ start: '2026-09-01', end: '2026-09-07' })
  })

  it('shows the error message from the API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Could not load weather data: timeout' }), { status: 502 }),
    ))
    renderPicker()

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-09-01' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-09-07' } })
    fireEvent.click(screen.getByRole('button', { name: 'Load period' }))

    expect(await screen.findByText('Could not load weather data: timeout')).toBeInTheDocument()
  })
})
