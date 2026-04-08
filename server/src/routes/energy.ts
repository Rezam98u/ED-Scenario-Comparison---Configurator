
// Backend Business Logic

import { Router } from 'express'
import { prisma } from '../lib/prisma.js'

export const energyRouter = Router()

// In-memory store for saved scenarios (resets on server restart)
interface SavedScenario {
  id: string
  pvKw: number
  kpis: Record<string, number>
  savedAt: string
}
const savedScenarios: SavedScenario[] = []

energyRouter.get('/energy/scenarios', (_req, res) => { res.json(savedScenarios) })

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

energyRouter.get('/energy', async (_req, res) => {
  try {
    const row = await prisma.energyDataset.findFirst({ orderBy: { createdAt: 'asc' } })

    if (!row) {
      res.status(404).json({ error: 'No energy data. Run migrations and seed.' })
      return
    }

    res.json({
      timestamps: row.timestamps,
      baseline: row.baseline,
      scenario: row.scenario,
      kpis: row.kpis,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Database error. Check DATABASE_URL and that PostgreSQL is running.' })
  }
})
