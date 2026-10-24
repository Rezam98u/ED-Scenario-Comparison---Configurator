
// Backend Business Logic

import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { listScenarios, addScenario } from '../agent/scenarioStore.js'
import type { Kpis } from '../../../shared/types.js'

export const energyRouter = Router()

const DATABASE_ERROR = 'Database error. Check DATABASE_URL and that PostgreSQL is running.'

energyRouter.get('/energy/scenarios', async (_req, res) => {
  try {
    res.json(await listScenarios())
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: DATABASE_ERROR })
  }
})

energyRouter.post('/energy/scenarios', async (req, res) => {

  // req.body is untyped network input, so fields are optional until validated below
  const { pvKw, kpis } = req.body as { pvKw?: unknown; kpis?: unknown }

  if (typeof pvKw !== 'number' || typeof kpis !== 'object' || kpis === null) {
    res.status(400).json({ error: 'pvKw (number) and kpis (object) are required' })
    return
  }

  // kpis was validated from the frontend; cast is safe here
  try {
    res.status(201).json(await addScenario(pvKw, kpis as Kpis))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: DATABASE_ERROR })
  }
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
    res.status(500).json({ error: DATABASE_ERROR })
  }
})
