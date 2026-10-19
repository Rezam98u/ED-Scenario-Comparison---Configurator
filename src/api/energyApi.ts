
// API contract and initial Api endpoint

import type { EnergyAnalysis, EnergyApiResponse, Kpis, SavedScenario, ScenarioResult } from '../types/energy'

const BASE_URL = window.location.origin

// Generic helper function
// Generic JSON parser that auto-infers the response type from the caller's return type annotation
// The function signature tells TypeScript what type to expect, so we don't repeat it in assertions
async function parseJsonResponse<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>
}

// Reads { "error": "..." } from an error response, falls back to the raw text
async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  const text = await response.text()
  let message = text
  try {
    const body = JSON.parse(text) as { error?: string }
    if (body.error) message = body.error
  } catch {
    /* use raw text */
  }
  return message || `${fallback}: ${response.status}`
}

export const energyApi = {
  async getEnergyData(): Promise<EnergyApiResponse> {
    const response = await fetch(`${BASE_URL}/api/energy`)

    if (!response.ok) {
      throw new Error(await readErrorMessage(response, 'Failed to fetch energy data'))
    }

    // Type automatically inferred from the function's return type signature
    return parseJsonResponse(response)
  },

  // Scenario calculation runs in the FastAPI backend (server-py/calculations.py)
  async calculateScenario(pvKw: number): Promise<ScenarioResult> {
    const response = await fetch(`${BASE_URL}/api/energy/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pvKw }),
    })

    if (!response.ok) {
      throw new Error(await readErrorMessage(response, 'Failed to calculate scenario'))
    }

    // Type automatically inferred from the function's return type signature
    return parseJsonResponse(response)
  },

  // Daily self-sufficiency, average daily profile and peak hours (pandas, server-py/analysis.py)
  async getAnalysis(): Promise<EnergyAnalysis> {
    const response = await fetch(`${BASE_URL}/api/energy/analysis`)

    if (!response.ok) {
      throw new Error(await readErrorMessage(response, 'Failed to fetch analysis'))
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
