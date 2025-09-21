import { http, HttpResponse } from 'msw'
import type { EnergyApiResponse } from '../types'
import mockData from '../../mock-data/energy-2025-01-01-2025-01-07.json'

export const handlers = [
  http.get('/api/energy', ({ request }) => {
    console.log('🎯 MSW Handler called for /api/energy')
    const url = new URL(request.url)
    const start = url.searchParams.get('start')
    const end = url.searchParams.get('end')
    
    // For demo purposes, we'll return the same mock data regardless of date range
    // In a real implementation, you'd filter the data based on start/end dates
    console.log(`Mock API: Fetching energy data from ${start} to ${end}`)
    
    const response: EnergyApiResponse = mockData as EnergyApiResponse
    console.log('🎯 MSW Handler returning response:', response)
    
    return HttpResponse.json(response)
  }),
]
