import type { EnergyApiResponse, Kpis, SavedScenario } from '../types/energy'

export class EnergyApiService {
  private readonly origin: string

  constructor() {
    const fromEnv = import.meta.env.VITE_API_URL as string | undefined
    this.origin = fromEnv ? fromEnv.replace(/\/$/, '') : window.location.origin
  }

  async getEnergyData(start: string, end: string): Promise<EnergyApiResponse> {
    const url = new URL('/api/energy', this.origin)
    url.searchParams.set('start', start)
    url.searchParams.set('end', end)

    const response = await fetch(url.toString())

    if (!response.ok) {
      const text = await response.text()
      let message = text
      try {
        const body = JSON.parse(text) as { error?: string }
        if (body.error) message = body.error
      } catch {
        /* use raw text */
      }
      throw new Error(message || `Failed to fetch energy data: ${response.status}`)
    }

    return response.json() as Promise<EnergyApiResponse>
  }

  async getSavedScenarios(): Promise<SavedScenario[]> {
    const response = await fetch(`${this.origin}/api/energy/scenarios`)

    if (!response.ok) {
      throw new Error(`Failed to fetch saved scenarios: ${response.status}`)
    }

    return response.json() as Promise<SavedScenario[]>
  }

  async saveScenario(pvKw: number, kpis: Kpis): Promise<SavedScenario> {
    const response = await fetch(`${this.origin}/api/energy/scenarios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pvKw, kpis }),
    })

    if (!response.ok) {
      throw new Error(`Failed to save scenario: ${response.status}`)
    }

    return response.json() as Promise<SavedScenario>
  }
}

export const energyApi = new EnergyApiService()
