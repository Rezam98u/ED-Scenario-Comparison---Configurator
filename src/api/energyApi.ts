
// API contract and initial Api endpoint

import type { EnergyApiResponse, Kpis, SavedScenario } from '../types/energy'

const BASE_URL = window.location.origin

// Generic helper function
// Generic JSON parser that auto-infers the response type from the caller's return type annotation
// The function signature tells TypeScript what type to expect, so we don't repeat it in assertions
async function parseJsonResponse<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>
}

export const energyApi = {
  async getEnergyData(): Promise<EnergyApiResponse> {
    const response = await fetch(`${BASE_URL}/api/energy`)

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

    // Type automatically inferred from the function's return type signature
    return parseJsonResponse(response)
  },

  async getSavedScenarios(): Promise<SavedScenario[]> {
    const response = await fetch(`${BASE_URL}/api/energy/scenarios`)
    if (!response.ok) { throw new Error(`Failed to fetch saved scenarios: ${response.status}`) }

    // Type automatically inferred from the function's return type signature
    return parseJsonResponse(response)
  },

  async saveScenario(pvKw: number, kpis: Kpis): Promise<SavedScenario> {
    const response = await fetch(`${BASE_URL}/api/energy/scenarios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pvKw, kpis }),
    })

    if (!response.ok) {
      throw new Error(`Failed to save scenario: ${response.status}`)
    }

    // Type automatically inferred from the function's return type signature
    return parseJsonResponse(response)
  },
}
