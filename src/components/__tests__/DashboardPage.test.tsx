import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'
import { handlers } from '../../mocks/handlers'
import { DashboardPage } from '../DashboardPage'

// Setup MSW server for testing
const server = setupServer(...handlers)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

// Test utility to render components with QueryClient
function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  )
}

describe('DashboardPage', () => {
  it('should render dashboard page with main elements', async () => {
    renderWithQueryClient(<DashboardPage />)

    // Check if main heading is present
    expect(screen.getByRole('heading', { name: /energy dashboard/i })).toBeInTheDocument()

    // Check if description is present
    expect(screen.getByText(/scenario comparison & configurator/i)).toBeInTheDocument()

    // Check if loading state appears first
    expect(document.querySelector('.animate-pulse')).toBeTruthy()
  })

  it('should render KPI cards, chart, and configurator after loading', async () => {
    renderWithQueryClient(<DashboardPage />)

    // Wait for content to load
    await screen.findByText(/total consumption/i, {}, { timeout: 5000 })

    // Check if KPI cards are rendered
    expect(screen.getByText(/total consumption/i)).toBeInTheDocument()
    expect(screen.getByText(/pv coverage/i)).toBeInTheDocument()
    expect(screen.getByText(/co₂ savings/i)).toBeInTheDocument()

    // Check if chart title is present
    expect(screen.getByText(/energy consumption & pv generation/i)).toBeInTheDocument()

    // Check if PV configurator is present
    expect(screen.getByText(/pv configuration/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/pv capacity/i)).toBeInTheDocument()
  })

  it('should display Apply Changes button in configurator', async () => {
    renderWithQueryClient(<DashboardPage />)

    // Wait for content to load
    await screen.findByText(/apply changes/i, {}, { timeout: 5000 })

    expect(screen.getByRole('button', { name: /apply changes/i })).toBeInTheDocument()
  })
})
