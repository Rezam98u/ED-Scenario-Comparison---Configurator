
// API contract and initial Api endpoint

import type {
  DatasetSummary, EnergyAnalysis, EnergyApiResponse, Kpis, SavedScenario, ScenarioResult,
} from '../types/energy'

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

// null = the default dataset (the backend uses the oldest one when no id is given)
export type DatasetId = string | null

// "?datasetId=..." for a chosen dataset, nothing for the default
function datasetQuery(datasetId: DatasetId): string {
  return datasetId === null ? '' : `?datasetId=${encodeURIComponent(datasetId)}`
}

export const energyApi = {
  async getEnergyData(datasetId: DatasetId = null): Promise<EnergyApiResponse> {
    const response = await fetch(`${BASE_URL}/api/energy${datasetQuery(datasetId)}`)

    if (!response.ok) {
      throw new Error(await readErrorMessage(response, 'Failed to fetch energy data'))
    }

    // Type automatically inferred from the function's return type signature
    return parseJsonResponse(response)
  },

  // Scenario calculation runs in the FastAPI backend (server-py/calculations.py)
  async calculateScenario(pvKw: number, datasetId: DatasetId = null): Promise<ScenarioResult> {
    const response = await fetch(`${BASE_URL}/api/energy/calculate${datasetQuery(datasetId)}`, {
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
  async getAnalysis(datasetId: DatasetId = null): Promise<EnergyAnalysis> {
    const response = await fetch(`${BASE_URL}/api/energy/analysis${datasetQuery(datasetId)}`)

    if (!response.ok) {
      throw new Error(await readErrorMessage(response, 'Failed to fetch analysis'))
    }

    // Type automatically inferred from the function's return type signature
    return parseJsonResponse(response)
  },

  // Imported periods, oldest first; the first one is the default
  async getDatasets(): Promise<DatasetSummary[]> {
    const response = await fetch(`${BASE_URL}/api/energy/datasets`)

    if (!response.ok) {
      throw new Error(await readErrorMessage(response, 'Failed to fetch periods'))
    }

    return parseJsonResponse(response)
  },

  // Imports a period from Open-Meteo, or returns it if it was imported before
  async importDataset(start: string, end: string): Promise<DatasetSummary> {
    const response = await fetch(`${BASE_URL}/api/energy/datasets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start, end }),
    })

    if (!response.ok) {
      throw new Error(await readErrorMessage(response, 'Failed to load period'))
    }

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
