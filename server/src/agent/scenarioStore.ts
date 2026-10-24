// Saved scenarios live in the SavedScenario table, shared by the HTTP routes
// (server/src/routes/energy.ts), the agent tools (server/src/agent/tools.ts) and
// FastAPI (server-py/main.py), so a scenario saved via chat shows up in the dashboard.

import type { SavedScenario as SavedScenarioRow } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import type { Kpis, SavedScenario } from '../../../shared/types.js'

function toApi(row: SavedScenarioRow): SavedScenario {
  // JSONB reorders object keys (shortest first), so rebuild kpis in API order (same as FastAPI)
  const { total_consumption_kwh, pv_coverage_pct, co2_savings_ton } = row.kpis as unknown as Kpis
  return {
    id: row.id,
    pvKw: row.pvKw,
    kpis: { total_consumption_kwh, pv_coverage_pct, co2_savings_ton },
    savedAt: row.savedAt.toISOString(),
  }
}

export async function listScenarios(): Promise<SavedScenario[]> {
  const rows = await prisma.savedScenario.findMany({ orderBy: { savedAt: 'desc' } })
  return rows.map(toApi)
}

export async function addScenario(pvKw: number, kpis: Kpis): Promise<SavedScenario> {
  const row = await prisma.savedScenario.create({
    data: { id: crypto.randomUUID(), pvKw, kpis: { ...kpis } },
  })
  return toApi(row)
}
