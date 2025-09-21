import { useState, useEffect } from 'react'
import { logger, type LogEntry } from './logger'

/**
 * React hook for accessing logger functionality in components
 */
export function useLogger() {
  const [logs, setLogs] = useState<LogEntry[]>(() => logger.getLogs())

  useEffect(() => {
    const unsubscribe = logger.subscribe(setLogs)
    return unsubscribe
  }, [])

  return {
    logs,
    errors: logs.filter(log => log.level === 'error'),
    warnings: logs.filter(log => log.level === 'warn'),
    
    // Logging methods
    error: logger.error.bind(logger),
    warn: logger.warn.bind(logger),
    info: logger.info.bind(logger),
    debug: logger.debug.bind(logger),
    
    // Utility methods
    clearLogs: logger.clearLogs.bind(logger),
    exportLogs: logger.exportLogs.bind(logger),
    downloadLogs: logger.downloadLogs.bind(logger),
    trackError: logger.trackError.bind(logger),
    trackApiError: logger.trackApiError.bind(logger),
    trackComponentError: logger.trackComponentError.bind(logger),
  }
}
