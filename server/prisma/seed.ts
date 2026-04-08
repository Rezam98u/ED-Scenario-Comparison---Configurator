import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'

const __dirname = dirname(fileURLToPath(import.meta.url))
const prisma = new PrismaClient()

async function main() {
  const jsonPath = join(__dirname, '../../mock-data/energy-2025-01-01-2025-01-07.json')
  const raw = readFileSync(jsonPath, 'utf-8')
  const payload = JSON.parse(raw) as {
    timestamps: string[]
    baseline: object
    scenario: object
    kpis: object
  }

  await prisma.energyDataset.deleteMany({})

  await prisma.energyDataset.create({
    data: {
      label: 'demo',
      rangeStart: new Date('2000-01-01'),
      rangeEnd: new Date('2100-12-31'),
      timestamps: payload.timestamps,
      baseline: payload.baseline,
      scenario: payload.scenario,
      kpis: payload.kpis,
    },
  })

  console.log('Seeded EnergyDataset from mock-data JSON.')
}

main()
  .catch((e) => { console.error(e), process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })