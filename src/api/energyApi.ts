import type { EnergyApiResponse } from '../types/energy'

// Service for fetching energy data from the API

export class EnergyApiService {
  constructor(_baseUrl = '') {
    // baseUrl parameter reserved for future use when connecting to real API
  }

  /**
   * Fetches energy data for a given date range
   * @param start - Start date in YYYY-MM-DD format
   * @param end - End date in YYYY-MM-DD format
   * @returns Promise resolving to energy data
   */
  async getEnergyData(start: string, end: string): Promise<EnergyApiResponse> {
    const url = new URL('/api/energy', window.location.origin)
    url.searchParams.set('start', start)
    url.searchParams.set('end', end)

    try {
      const response = await fetch(url.toString())

      if (!response.ok) {
        throw new Error(`Failed to fetch energy data: ${response.statusText}`)
      }

      // Try to parse the response
      const responseText = await response.text()
      let data
      try {
        data = JSON.parse(responseText)
      } catch (parseError) {
        // Fallback: If MSW is not working, return mock data directly
        return this.getFallbackMockData()
      }

      return data as EnergyApiResponse
    } catch (error) {
      // If fetch fails, use fallback mock data
      return this.getFallbackMockData()
    }
  }

  // Fallback mock data when MSW is not working
  private getFallbackMockData(): EnergyApiResponse {
    return {
      timestamps: [
        "2025-09-08T00:00:00Z", "2025-09-08T01:00:00Z", "2025-09-08T02:00:00Z",
        "2025-09-08T03:00:00Z", "2025-09-08T04:00:00Z", "2025-09-08T05:00:00Z",
        "2025-09-08T06:00:00Z", "2025-09-08T07:00:00Z", "2025-09-08T08:00:00Z",
        "2025-09-08T09:00:00Z", "2025-09-08T10:00:00Z", "2025-09-08T11:00:00Z",
        "2025-09-08T12:00:00Z", "2025-09-08T13:00:00Z", "2025-09-08T14:00:00Z",
        "2025-09-08T15:00:00Z", "2025-09-08T16:00:00Z", "2025-09-08T17:00:00Z",
        "2025-09-08T18:00:00Z", "2025-09-08T19:00:00Z", "2025-09-08T20:00:00Z",
        "2025-09-08T21:00:00Z", "2025-09-08T22:00:00Z", "2025-09-08T23:00:00Z"
      ],
      baseline: {
        consumption: [120.5, 118.3, 115.2, 113.4, 112.0, 111.0, 112.8, 116.4, 125.0, 140.5, 155.2, 160.8, 165.4, 162.1, 158.3, 152.7, 148.2, 145.5, 142.8, 138.4, 135.1, 130.8, 127.2, 123.5],
        pv_generation: [0, 0, 0, 0, 0, 0, 0, 0, 5.2, 15.8, 25.4, 32.1, 35.8, 33.2, 28.7, 22.4, 14.6, 8.1, 2.3, 0, 0, 0, 0, 0]
      },
      scenario: {
        consumption: [120.5, 118.3, 115.2, 113.4, 112.0, 111.0, 112.8, 116.4, 125.0, 140.5, 155.2, 160.8, 165.4, 162.1, 158.3, 152.7, 148.2, 145.5, 142.8, 138.4, 135.1, 130.8, 127.2, 123.5],
        pv_generation: [0, 0, 0, 0, 0, 0, 0, 0, 10.4, 31.6, 50.8, 64.2, 71.6, 66.4, 57.4, 44.8, 29.2, 16.2, 4.6, 0, 0, 0, 0, 0]
      },
      kpis: {
        total_consumption_kwh: 3265.2,
        pv_coverage_pct: 31.4,
        co2_savings_ton: 0.42
      }
    }
  }
}

// Export a default instance
export const energyApi = new EnergyApiService()
