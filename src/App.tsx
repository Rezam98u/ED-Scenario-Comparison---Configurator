// import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ErrorBoundary } from './components/ErrorBoundary'
// import { ErrorConsole } from './components/ErrorConsole'
// import { ErrorDemo } from './components/ErrorDemo'
import { DashboardPage } from './components/DashboardPage'

// Create a client with error logging
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minuteso
      retry: 1,
    },
    mutations: {
      retry: 1,
    },
  },
})

function App() {
  console.log('App component rendering')
  // const [isErrorConsoleOpen, setIsErrorConsoleOpen] = useState(false)

  return (
    <ErrorBoundary context="App">
      <QueryClientProvider client={queryClient}>
        <DashboardPage />

        {/* <ErrorConsole
          isOpen={isErrorConsoleOpen}
          onToggle={() => setIsErrorConsoleOpen(!isErrorConsoleOpen)}
        /> */}
        {import.meta.env.MODE === 'development'}
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
