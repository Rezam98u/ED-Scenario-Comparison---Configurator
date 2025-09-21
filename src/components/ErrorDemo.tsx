import { useState } from 'react'
import { useLogger } from '../utils/useLogger'

/**
 * Demo component to test the logging system with various error types
 * This component is for development/testing purposes only
 */
export function ErrorDemo() {
  const [showDemo, setShowDemo] = useState(false)
  const { error, warn, info, debug } = useLogger()

  if (!showDemo) {
    return (
      <button
        onClick={() => setShowDemo(true)}
        className="fixed top-4 right-4 z-40 bg-purple-600 text-white px-3 py-2 rounded text-sm hover:bg-purple-700 transition-colors"
        title="Show Error Demo (Development Only)"
      >
        🐛 Error Demo
      </button>
    )
  }

  const triggerJavaScriptError = () => {
    // @ts-ignore - Intentionally causing an error
    const obj = null
    // @ts-ignore
    obj.someProperty.nonExistent = 'value'
  }

  const triggerPromiseRejection = () => {
    Promise.reject(new Error('This is a test promise rejection'))
  }

  const triggerAsyncError = async () => {
    await new Promise(resolve => setTimeout(resolve, 100))
    throw new Error('This is a test async error')
  }

  const triggerCalculationError = () => {
    try {
      // Simulate a calculation error
      const invalidData = { consumption: null, pv_generation: undefined }
      // @ts-ignore
      invalidData.consumption.reduce((a, b) => a + b, 0)
    } catch (err) {
      const invalidData = { consumption: null, pv_generation: undefined }
      error('Calculation failed with invalid data', 'ErrorDemo', {
        errorType: 'calculation',
        data: invalidData,
        error: err instanceof Error ? err.message : String(err)
      })
    }
  }

  const triggerApiError = () => {
    fetch('/non-existent-endpoint')
      .then(response => {
        if (!response.ok) {
          throw new Error(`API Error: ${response.status}`)
        }
      })
      .catch(() => {
        error('Mock API call failed', 'ErrorDemo', {
          errorType: 'api',
          endpoint: '/non-existent-endpoint'
        })
      })
  }

  const triggerCustomLogs = () => {
    debug('This is a debug message', 'ErrorDemo', { level: 'debug' })
    info('This is an info message', 'ErrorDemo', { level: 'info' })
    warn('This is a warning message', 'ErrorDemo', { level: 'warning' })
    error('This is an error message', 'ErrorDemo', { level: 'error' })
  }

  return (
    <div className="fixed top-4 right-4 z-40 bg-white rounded-lg shadow-lg border border-gray-200 p-4 w-80">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900">Error Demo</h3>
        <button
          onClick={() => setShowDemo(false)}
          className="text-gray-500 hover:text-gray-700"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="space-y-2">
        <button
          onClick={triggerJavaScriptError}
          className="w-full text-left px-3 py-2 text-sm bg-red-50 text-red-700 rounded hover:bg-red-100 transition-colors"
        >
          🚨 JavaScript Error
        </button>

        <button
          onClick={triggerPromiseRejection}
          className="w-full text-left px-3 py-2 text-sm bg-red-50 text-red-700 rounded hover:bg-red-100 transition-colors"
        >
          🔥 Promise Rejection
        </button>

        <button
          onClick={() => triggerAsyncError().catch(() => {})}
          className="w-full text-left px-3 py-2 text-sm bg-red-50 text-red-700 rounded hover:bg-red-100 transition-colors"
        >
          ⚡ Async Error
        </button>

        <button
          onClick={triggerCalculationError}
          className="w-full text-left px-3 py-2 text-sm bg-orange-50 text-orange-700 rounded hover:bg-orange-100 transition-colors"
        >
          🧮 Calculation Error
        </button>

        <button
          onClick={triggerApiError}
          className="w-full text-left px-3 py-2 text-sm bg-yellow-50 text-yellow-700 rounded hover:bg-yellow-100 transition-colors"
        >
          🌐 API Error
        </button>

        <button
          onClick={triggerCustomLogs}
          className="w-full text-left px-3 py-2 text-sm bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition-colors"
        >
          📝 All Log Levels
        </button>
      </div>

      <div className="mt-3 pt-3 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          Click buttons to trigger different error types. Check the error console (red button) to see captured logs.
        </p>
      </div>
    </div>
  )
}
