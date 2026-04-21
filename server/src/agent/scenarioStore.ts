// Shared in-memory store for saved scenarios — used by both the HTTP routes
// (server/src/routes/energy.ts) and the agent tools (server/src/agent/tools.ts)
// so that a scenario saved via chat immediately shows up in the dashboard list.

import type { Kpis, SavedScenario } from '../../../shared/types.js'

const savedScenarios: SavedScenario[] = []

export function listScenarios(): SavedScenario[] {
  return savedScenarios
}

export function addScenario(pvKw: number, kpis: Kpis): SavedScenario {
  const scenario: SavedScenario = {
    id: crypto.randomUUID(),
    pvKw,
    kpis,
    savedAt: new Date().toISOString(),
  }
  savedScenarios.unshift(scenario)
  return scenario
}
