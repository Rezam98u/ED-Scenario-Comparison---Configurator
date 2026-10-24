// Runs the TypeScript calculateScenario (the reference) on the real-week snapshot and saves the
// results as a fixture for server-py/test_calculations.py.
//
// Run from the repo root (npx downloads tsx if it is not installed):
//   npx tsx server-py/tests/generate_parity_fixture.ts

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { calculateScenario } from '../../src/utils/calculateScenario'
import type { Baseline } from '../../src/types/energy'

const PV_KW_VALUES = [0, 5, 10, 33.3, 100]

const here = dirname(fileURLToPath(import.meta.url))
const realWeekPath = join(here, 'fixtures/baseline_2026-08-01_2026-08-07.json')
const outputPath = join(here, 'fixtures/scenario_parity.json')

const { baseline } = JSON.parse(readFileSync(realWeekPath, 'utf-8')) as { baseline: Baseline }

const cases = PV_KW_VALUES.map((pvKw) => ({ pvKw, result: calculateScenario(baseline, pvKw) }))

// JSON.stringify writes the shortest text that reads back as the exact same double,
// so Python's json.load gets bit-identical numbers.
writeFileSync(outputPath, JSON.stringify({ cases }, null, 2) + '\n')
console.log(`Wrote ${cases.length} cases to ${outputPath}`)
