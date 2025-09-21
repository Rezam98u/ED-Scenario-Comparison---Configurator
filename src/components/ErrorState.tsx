interface ErrorStateProps {
  error: Error | string
  onRetry?: () => void
  className?: string
}

export function ErrorState({ error, onRetry, className = '' }: ErrorStateProps) {
  const errorMessage = typeof error === 'string' ? error : error.message

  return (
    <div className={`bg-red-50 border border-red-200 rounded-lg p-6 text-center ${className}`}>
      <div className="text-red-600 mb-4">
        <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.232 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <h3 className="text-lg font-semibold">Something went wrong</h3>
      </div>
      <p className="text-red-700 mb-4">{errorMessage}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition-colors"
        >
          Try Again
        </button>
      )}
    </div>
  )
}
