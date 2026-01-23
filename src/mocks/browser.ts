import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

// Configure MSW service worker for development
export const worker = setupWorker(...handlers)

// Start MSW worker
worker.start({
  onUnhandledRequest: 'warn'
})
