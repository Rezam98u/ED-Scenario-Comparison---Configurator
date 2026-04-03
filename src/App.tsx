import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ErrorBoundary } from './components/ErrorBoundary'
import { DashboardPage } from './components/DashboardPage'

// staleTime: how long cached data is considered fresh (no refetch during this window)
// gcTime:    how long unused cache entries are kept in memory before being removed
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,  // data is fresh for 5 minutes
      gcTime: 10 * 60 * 1000,    // unused cache lives for 10 minutes
      retry: 1,
    },
    mutations: {
      retry: 0, // mutations should not auto-retry — let the user decide
    },
  },
})

function App() {
  return (
    <ErrorBoundary context="App">
      <QueryClientProvider client={queryClient}>
        <DashboardPage />
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
