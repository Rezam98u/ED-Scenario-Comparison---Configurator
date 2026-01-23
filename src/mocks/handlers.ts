import { http, HttpResponse } from 'msw'
import type { EnergyApiResponse } from '../types/energy'
import mockData from '../../mock-data/energy-2025-01-01-2025-01-07.json'

export const handlers = [
  http.get('/api/energy', () => {
    // Return mock data for development
    const response: EnergyApiResponse = mockData as EnergyApiResponse
    return HttpResponse.json(response)
  }),
]
