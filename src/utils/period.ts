// Periods ("YYYY-MM-DD" UTC days): the limits for loading one and how to show it

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
