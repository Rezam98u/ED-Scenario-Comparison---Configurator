// Tool definitions for the Groq agent. Each tool has:
//   1. a JSON schema (sent to the LLM so it knows how to call the function)
//   2. a zod schema for runtime validation of the arguments the LLM produces
//   3. a handler that runs the actual logic

import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { calculateScenario, type Baseline } from './calculateScenario.js'
import { optimizeScenario, type Objective } from './optimizer.js'
import { listScenarios, addScenario } from './scenarioStore.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loadBaseline(): Promise<Baseline> {
  const row = await prisma.energyDataset.findFirst({ orderBy: { createdAt: 'asc' } })
  if (!row) throw new Error('No energy data in database. Run migrations and seed.')
  return row.baseline as unknown as Baseline
}

// ─── Argument schemas (zod) ──────────────────────────────────────────────────

const empty = z.object({}).strict()

const calcArgs = z.object({ pvKw: z.number().min(0).max(1000) })

const saveArgs = z.object({ pvKw: z.number().min(0).max(1000) })

const optimizeArgs = z.object({
  objective: z.enum(['co2', 'coverage', 'minConsumption']),
  minKw: z.number().min(0).max(1000).optional(),
  maxKw: z.number().min(0).max(1000).optional(),
  stepKw: z.number().min(0.1).max(50).optional(),
})

// ─── JSON Schemas (shape Groq/OpenAI expect for `tools`) ─────────────────────

export const toolSchemas = [
  {
    type: 'function' as const,
    function: {
      name: 'getEnergyData',
      description:
        'Return the seeded 7-day hourly baseline dataset (timestamps, consumption kWh, PV generation kWh) and its baseline KPIs. Call this first if you need to know what data is available before doing calculations.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'calculateScenario',
      description:
        'Simulate what the KPIs would be if PV capacity were set to pvKw. Use this for "what-if" questions about a specific PV size.',
      parameters: {
        type: 'object',
        properties: {
          pvKw: { type: 'number', description: 'PV capacity in kW (0-1000)' },
        },
        required: ['pvKw'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'optimizeScenario',
      description:
        'Find the optimal PV capacity (kW) that maximizes the given objective. Use this whenever the user asks for the "best", "optimal", or "ideal" PV size. Returns the best pvKw, its KPIs, and the full search path.',
      parameters: {
        type: 'object',
        properties: {
          objective: {
            type: 'string',
            enum: ['co2', 'coverage', 'minConsumption'],
            description:
              'co2 = maximize CO2 savings (tons); coverage = maximize PV coverage (%); minConsumption = minimize grid consumption (kWh)',
          },
          minKw: { type: 'number', description: 'Lower bound of search range in kW (default 0)' },
          maxKw: { type: 'number', description: 'Upper bound of search range in kW (default 100)' },
          stepKw: { type: 'number', description: 'Search step size in kW (default 1)' },
        },
        required: ['objective'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'listScenarios',
      description: 'Return all scenarios the user has saved in this session.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'saveScenario',
      description:
        'Save a scenario with the given PV capacity. The KPIs are computed server-side from the canonical baseline so the saved record stays consistent with the dashboard.',
      parameters: {
        type: 'object',
        properties: {
          pvKw: { type: 'number', description: 'PV capacity in kW (0-1000)' },
        },
        required: ['pvKw'],
      },
    },
  },
]

// ─── Handlers ────────────────────────────────────────────────────────────────

export const toolHandlers: Record<string, (args: unknown) => Promise<unknown>> = {
  async getEnergyData(args) {
    empty.parse(args ?? {})
    const row = await prisma.energyDataset.findFirst({ orderBy: { createdAt: 'asc' } })
    if (!row) throw new Error('No energy data in database. Run migrations and seed.')
    return {
      timestamps: row.timestamps,
      baseline: row.baseline,
      baselineKpis: row.kpis,
    }
  },

  async calculateScenario(args) {
    const { pvKw } = calcArgs.parse(args)
    const baseline = await loadBaseline()
    const { kpis } = calculateScenario(baseline, pvKw)
    return { pvKw, kpis }
  },

  async optimizeScenario(args) {
    const parsed = optimizeArgs.parse(args)
    const baseline = await loadBaseline()
    const result = optimizeScenario(baseline, {
      objective: parsed.objective as Objective,
      minKw: parsed.minKw,
      maxKw: parsed.maxKw,
      stepKw: parsed.stepKw,
    })
    // Downsample searchPath so the LLM context stays small — keep the top 5
    // plus every 10th point for a compact summary.
    const sorted = [...result.searchPath].sort((a, b) => {
      const score = (p: typeof a) =>
        parsed.objective === 'co2' ? p.kpis.co2_savings_ton
          : parsed.objective === 'coverage' ? p.kpis.pv_coverage_pct
            : -p.kpis.total_consumption_kwh
      return score(b) - score(a)
    })
    return {
      objective: result.objective,
      bestPvKw: result.bestPvKw,
      bestKpis: result.bestKpis,
      topFive: sorted.slice(0, 5),
      sampledPath: result.searchPath.filter((_, i) => i % 10 === 0),
    }
  },

  async listScenarios(args) {
    empty.parse(args ?? {})
    return listScenarios()
  },

  async saveScenario(args) {
    const { pvKw } = saveArgs.parse(args)
    const baseline = await loadBaseline()
    const { kpis } = calculateScenario(baseline, pvKw)
    return addScenario(pvKw, kpis)
  },
}
