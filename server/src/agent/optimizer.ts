// Deterministic grid-search optimizer for PV capacity, exposed as an agent tool.
// Runs calculateScenario across a range of pvKw values and returns the best one
// for the requested objective, plus the full search path for visualization.

import { calculateScenario, type Baseline, type Kpis } from './calculateScenario.js'

export type Objective = 'co2' | 'coverage' | 'minConsumption'

export interface OptimizerOptions {
  objective: Objective
  minKw?: number
  maxKw?: number
  stepKw?: number
}

export interface SearchPoint {
  pvKw: number
  kpis: Kpis
}

export interface OptimizerResult {
  objective: Objective
  bestPvKw: number
  bestKpis: Kpis
  searchPath: SearchPoint[]
}

function score(kpis: Kpis, objective: Objective): number {
  switch (objective) {
    case 'co2': return kpis.co2_savings_ton
    case 'coverage': return kpis.pv_coverage_pct
    case 'minConsumption': return -kpis.total_consumption_kwh
  }
}

export function optimizeScenario(baseline: Baseline, opts: OptimizerOptions): OptimizerResult {
  const { objective, minKw = 0, maxKw = 100, stepKw = 1 } = opts

  if (minKw < 0 || maxKw < minKw || stepKw <= 0) {
    throw new Error('Invalid optimizer range')
  }

  const searchPath: SearchPoint[] = []
  let best: SearchPoint | null = null
  let bestScore = -Infinity

  for (let kw = minKw; kw <= maxKw; kw += stepKw) {
    const { kpis } = calculateScenario(baseline, kw)
    const point: SearchPoint = { pvKw: kw, kpis }
    searchPath.push(point)

    const s = score(kpis, objective)
    if (s > bestScore) {
      bestScore = s
      best = point
    }
  }

  if (!best) throw new Error('Optimizer produced no results')

  return {
    objective,
    bestPvKw: best.pvKw,
    bestKpis: best.kpis,
    searchPath,
  }
}
