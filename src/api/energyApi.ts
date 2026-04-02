import type { EnergyApiResponse } from '../types/energy'

function apiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_URL as string | undefined
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  return ''
}

// Service for fetching energy data from the API

export class EnergyApiService {
  /**
   * Fetches energy data for a given date range
   * @param start - Start date in YYYY-MM-DD format
   * @param end - End date in YYYY-MM-DD format
   */
  async getEnergyData(start: string, end: string): Promise<EnergyApiResponse> {
    const origin = apiBaseUrl() || window.location.origin
    const url = new URL('/api/energy', origin)
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
}

export const energyApi = new EnergyApiService()
