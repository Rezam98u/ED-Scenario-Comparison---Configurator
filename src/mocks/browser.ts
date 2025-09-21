import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

// This configures a Service Worker with the given request handlers.
export const worker = setupWorker(...handlers)

// Start MSW in development
console.log('Starting MSW worker...')
worker.start({
  onUnhandledRequest: 'warn'
}).then(() => {
  console.log('MSW worker started successfully')
}).catch((error) => {
  console.error('Failed to start MSW worker:', error)
})
