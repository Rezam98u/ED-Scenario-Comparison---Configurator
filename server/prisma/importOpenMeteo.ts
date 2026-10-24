// Seed script: fills EnergyDataset with real data (the mock dataset is only used on main):
// - PV generation: Open-Meteo historical weather API (tilted irradiance) converted to kWh
// - Consumption: BDEW G0 standard load profile (commercial), scaled to an annual kWh total
//
// Usage (from server/): npm run db:seed
//                  or:  npm run db:import-weather -- --start 2026-08-01 --end 2026-08-07
// Every flag is optional; see DEFAULTS below.

import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { PrismaClient } from '@prisma/client'
import { calculateScenario, type Baseline } from '../src/agent/calculateScenario.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const prisma = new PrismaClient()

const DEFAULTS = {
  lat: '51.2277',        // Düsseldorf, NRW
  lon: '6.7735',
  start: '2026-08-01',   // inclusive, UTC days
  end: '2026-08-07',
  kwp: '10',             // baseline PV system size
  tilt: '35',            // panel tilt in degrees
  azimuth: '0',          // Open-Meteo convention: 0 = south, -90 = east, 90 = west
  pr: '0.85',            // performance ratio (inverter, wiring, soiling, temperature losses)
  'annual-kwh': '75000', // ≈ 1,430 kWh/week
}

// Same pvKw the dashboard starts with, so the stored scenario/kpis match what it shows first
const SCENARIO_PV_KW = 10
const TIME_ZONE = 'Europe/Berlin' // BDEW profiles are in German local time
const HOUR_MS = 3_600_000

type DayType = 'workday' | 'saturday' | 'sunday'
type Season = 'winter' | 'summer' | 'transition'
type G0Profile = Record<Season, Record<DayType, number[]>>

const g0 = JSON.parse(readFileSync(join(__dirname, 'data/bdew-g0.json'), 'utf-8')) as G0Profile

// --- Open-Meteo: PV generation ----------------------------------------------

async function fetchPvKwh(opts: typeof DEFAULTS, startMs: number, hours: number): Promise<number[]> {
  // Radiation is the mean over the PRECEDING hour (value at 01:00 covers 00:00–01:00),
  // so we need one extra hour after the range: fetch one extra day.
  const endPlusOne = new Date(Date.parse(opts.end) + 24 * HOUR_MS).toISOString().slice(0, 10)
  const params = new URLSearchParams({
    latitude: opts.lat,
    longitude: opts.lon,
    start_date: opts.start,
    end_date: endPlusOne,
    hourly: 'global_tilted_irradiance',
    tilt: opts.tilt,
    azimuth: opts.azimuth,
    timezone: 'UTC',
  })
  const res = await fetch(`https://archive-api.open-meteo.com/v1/archive?${params}`)
  const body = await res.json() as {
    reason?: string
    hourly?: { time: string[]; global_tilted_irradiance: (number | null)[] }
  }
  if (!res.ok || !body.hourly) throw new Error(`Open-Meteo: ${body.reason ?? res.statusText}`)

  const { time, global_tilted_irradiance: irradiance } = body.hourly
  const kwp = Number(opts.kwp)
  const pr = Number(opts.pr)
  const pv: number[] = []

  for (let i = 0; i < hours; i++) {
    const labelMs = startMs + (i + 1) * HOUR_MS
    const idx = time.indexOf(new Date(labelMs).toISOString().slice(0, 16))
    const wm2 = idx === -1 ? null : irradiance[idx]
    if (wm2 == null) {
      throw new Error(`Open-Meteo has no data for ${new Date(labelMs).toISOString()} yet. Pick an earlier --end.`)
    }
    // Simple PR model: kWp × (irradiance / 1000 W/m² STC) × PR, over one hour → kWh
    pv.push(round3(kwp * (wm2 / 1000) * pr))
  }
  return pv
}

// --- BDEW G0: consumption ---------------------------------------------------

function easterSunday(year: number): Date {
  // Anonymous Gregorian algorithm (Meeus/Jones/Butcher)
  const a = year % 19, b = Math.floor(year / 100), c = year % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month - 1, day))
}

/** Public holidays in NRW as YYYY-MM-DD. The BDEW method treats them like Sundays. */
function nrwHolidays(year: number): Set<string> {
  const easter = easterSunday(year).getTime()
  const fromEaster = (days: number) => new Date(easter + days * 24 * HOUR_MS).toISOString().slice(0, 10)
  return new Set([
    `${year}-01-01`, fromEaster(-2), fromEaster(1), `${year}-05-01`, fromEaster(39),
    fromEaster(50), fromEaster(60), `${year}-10-03`, `${year}-11-01`, `${year}-12-25`, `${year}-12-26`,
  ])
}

const localParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
  weekday: 'short', hourCycle: 'h23',
})

function toLocal(ms: number) {
  const p = Object.fromEntries(localParts.formatToParts(ms).map((x) => [x.type, x.value]))
  return {
    year: Number(p.year), month: Number(p.month), day: Number(p.day), hour: Number(p.hour),
    date: `${p.year}-${p.month}-${p.day}`, weekday: p.weekday,
  }
}

function season(month: number, day: number): Season {
  const md = month * 100 + day
  if (md <= 320 || md >= 1101) return 'winter'      // Nov 1 – Mar 20
  if (md >= 515 && md <= 914) return 'summer'       // May 15 – Sep 14
  return 'transition'
}

/** Unscaled G0 value for the local hour that starts at ms (sum of its 4 quarter-hours). */
function rawG0(ms: number, holidays: Set<string>): number {
  const t = toLocal(ms)
  const dayType: DayType = t.weekday === 'Sun' || holidays.has(t.date) ? 'sunday'
    : t.weekday === 'Sat' ? 'saturday' : 'workday'
  const quarters = g0[season(t.month, t.day)][dayType]
  return quarters.slice(t.hour * 4, t.hour * 4 + 4).reduce((s, v) => s + v, 0)
}

function consumptionKwh(startMs: number, hours: number, annualKwh: number): number[] {
  // Scale so the whole local calendar year adds up to annualKwh
  const year = toLocal(startMs).year
  const holidays = nrwHolidays(year)
  let yearTotal = 0
  for (let ms = Date.UTC(year - 1, 11, 31); ms < Date.UTC(year + 1, 0, 2); ms += HOUR_MS) {
    if (toLocal(ms).year === year) yearTotal += rawG0(ms, holidays)
  }
  const factor = annualKwh / yearTotal

  const values: number[] = []
  for (let i = 0; i < hours; i++) {
    const ms = startMs + i * HOUR_MS
    values.push(round3(rawG0(ms, nrwHolidays(toLocal(ms).year)) * factor))
  }
  return values
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000
}

// --- Main ---------------------------------------------------------------------

async function main() {
  const { values } = parseArgs({
    options: Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, { type: 'string' }])),
  })
  const opts = { ...DEFAULTS, ...values } as typeof DEFAULTS

  const startMs = Date.parse(`${opts.start}T00:00:00Z`)
  const endMs = Date.parse(`${opts.end}T00:00:00Z`)
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) {
    throw new Error('--start and --end must be YYYY-MM-DD dates with start <= end')
  }
  const hours = (endMs - startMs) / HOUR_MS + 24

  const timestamps = Array.from({ length: hours }, (_, i) => new Date(startMs + i * HOUR_MS).toISOString())
  const baseline: Baseline = {
    consumption: consumptionKwh(startMs, hours, Number(opts['annual-kwh'])),
    pv_generation: await fetchPvKwh(opts, startMs, hours),
  }
  const { scenario, kpis } = calculateScenario(baseline, SCENARIO_PV_KW)

  // Both backends serve the oldest row, so any previous dataset has to go
  await prisma.energyDataset.deleteMany({})
  await prisma.energyDataset.create({
    data: {
      label: `open-meteo ${opts.lat},${opts.lon} ${opts.kwp} kWp + BDEW G0`,
      rangeStart: new Date(startMs),
      rangeEnd: new Date(endMs),
      timestamps,
      baseline: { ...baseline },
      scenario: { ...scenario },
      kpis: { ...kpis },
    },
  })

  const sum = (a: number[]) => Math.round(a.reduce((s, v) => s + v, 0) * 10) / 10
  console.log(`Imported ${hours} hours (${opts.start} to ${opts.end}) at ${opts.lat},${opts.lon}:`)
  console.log(`  consumption ${sum(baseline.consumption)} kWh, PV ${sum(baseline.pv_generation)} kWh (${opts.kwp} kWp)`)
}

main()
  .catch((e) => { console.error(e), process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
