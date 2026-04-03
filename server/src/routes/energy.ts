import { Router } from 'express'
import { prisma } from '../lib/prisma.js'

export const energyRouter = Router()

// In-memory store for saved scenarios (resets on server restart — MVP)
interface SavedScenario {
  id: string
  pvKw: number
  kpis: Record<string, number>
  savedAt: string
}
const savedScenarios: SavedScenario[] = []

energyRouter.get('/energy/scenarios', (_req, res) => {
  res.json(savedScenarios)
})

energyRouter.post('/energy/scenarios', (req, res) => {
  const { pvKw, kpis } = req.body as { pvKw?: unknown; kpis?: unknown }

  if (typeof pvKw !== 'number' || typeof kpis !== 'object' || kpis === null) {
    res.status(400).json({ error: 'pvKw (number) and kpis (object) are required' })
    return
  }

  const scenario: SavedScenario = {
    id: crypto.randomUUID(),
    pvKw,
    kpis: kpis as Record<string, number>,
    savedAt: new Date().toISOString(),
  }

  savedScenarios.unshift(scenario)
  res.status(201).json(scenario)
})

energyRouter.get('/energy', async (req, res) => {
  const start = req.query.start
  const end = req.query.end

  if (typeof start !== 'string' || typeof end !== 'string') {
    res.status(400).json({
      error: 'Query params "start" and "end" are required (YYYY-MM-DD).',
    })
    return
  }

  const startDate = new Date(`${start}T00:00:00.000Z`)
  const endDate = new Date(`${end}T00:00:00.000Z`)

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    res.status(400).json({ error: 'Invalid date. Use YYYY-MM-DD.' })
    return
  }

  const rows = await prisma.energyDataset.findMany({ orderBy: { createdAt: 'asc' } })
  const overlapping = rows.find((row) => row.rangeStart <= endDate && row.rangeEnd >= startDate)
  const row = overlapping ?? rows[0]

  if (!row) {
    res.status(404).json({ error: 'No energy data. Create the database, run migrations, then seed.' })
    return
  }

  res.json({
    timestamps: row.timestamps,
    baseline: row.baseline,
    scenario: row.scenario,
    kpis: row.kpis,
  })
})
