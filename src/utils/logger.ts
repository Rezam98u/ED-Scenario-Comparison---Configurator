/**
 * Centralized logging service for error tracking and debugging
 */

export interface LogEntry {
  id: string
  timestamp: Date
  level: 'error' | 'warn' | 'info' | 'debug'
  message: string
  context?: string
  stack?: string
  metadata?: Record<string, any>
}

export interface LoggerConfig {
  maxEntries: number
  enableConsoleOutput: boolean
  enableErrorCapture: boolean
}

class Logger {
  private logs: LogEntry[] = []
  private listeners: ((logs: LogEntry[]) => void)[] = []
  private config: LoggerConfig = {
    maxEntries: 100,
    enableConsoleOutput: true,
    enableErrorCapture: true,
  }
  private readonly storageKey = 'energy-dashboard-logs'
  private isLogging = false // Prevent infinite recursion

  constructor() {
    this.loadPersistedLogs()
    this.setupGlobalErrorHandlers()
  }

  configure(config: Partial<LoggerConfig>) {
    this.config = { ...this.config, ...config }
  }

  private loadPersistedLogs() {
    try {
      const stored = localStorage.getItem(this.storageKey)
      if (stored) {
        const parsedLogs = JSON.parse(stored)
        // Convert timestamp strings back to Date objects
        this.logs = parsedLogs.map((log: any) => ({
          ...log,
          timestamp: new Date(log.timestamp)
        }))
      }
    } catch (error) {
      console.warn('Failed to load persisted logs:', error)
    }
  }

  private persistLogs() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.logs))
    } catch (error) {
      console.warn('Failed to persist logs:', error)
    }
  }

  private setupGlobalErrorHandlers() {
    // Capture unhandled JavaScript errors
    window.addEventListener('error', (event) => {
      this.error('Unhandled JavaScript Error', 'global', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack,
      })
    })

    // Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.error('Unhandled Promise Rejection', 'global', {
        reason: event.reason,
        stack: event.reason?.stack,
      })
    })

    // Note: Console error capture disabled to prevent infinite recursion
    // If needed, it should be implemented with a flag to prevent loops
  }

  private addLog(level: LogEntry['level'], message: string, context?: string, metadata?: Record<string, any>) {
    // Prevent infinite recursion
    if (this.isLogging) {
      return
    }
    
    this.isLogging = true
    
    try {
      const logEntry: LogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
        level,
        message,
        context,
        metadata,
        stack: level === 'error' ? new Error().stack : undefined,
      }

      this.logs.unshift(logEntry) // Add to beginning for newest first

      // Trim logs if exceeding max entries
      if (this.logs.length > this.config.maxEntries) {
        this.logs = this.logs.slice(0, this.config.maxEntries)
      }

      // Console output (safely)
      if (this.config.enableConsoleOutput) {
        try {
          const logMethod = console[level] || console.log
          logMethod(`[${level.toUpperCase()}] ${context ? `[${context}] ` : ''}${message}`, metadata || '')
        } catch (consoleError) {
          // If console logging fails, just ignore it to prevent loops
        }
      }

      // Persist to localStorage (safely)
      try {
        this.persistLogs()
      } catch (persistError) {
        // If persistence fails, just ignore it
      }

      // Notify listeners (safely)
      try {
        this.notifyListeners()
      } catch (notifyError) {
        // If notification fails, just ignore it
      }
    } finally {
      this.isLogging = false
    }
  }

  error(message: string, context?: string, metadata?: Record<string, any>) {
    this.addLog('error', message, context, metadata)
  }

  warn(message: string, context?: string, metadata?: Record<string, any>) {
    this.addLog('warn', message, context, metadata)
  }

  info(message: string, context?: string, metadata?: Record<string, any>) {
    this.addLog('info', message, context, metadata)
  }

  debug(message: string, context?: string, metadata?: Record<string, any>) {
    this.addLog('debug', message, context, metadata)
  }

  // Subscription methods for components
  subscribe(listener: (logs: LogEntry[]) => void): () => void {
    this.listeners.push(listener)
    
    // Return unsubscribe function
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener)
    }
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener([...this.logs]))
  }

  // Utility methods
  getLogs(level?: LogEntry['level']): LogEntry[] {
    if (level) {
      return this.logs.filter(log => log.level === level)
    }
    return [...this.logs]
  }

  getErrors(): LogEntry[] {
    return this.getLogs('error')
  }

  clearLogs() {
    this.logs = []
    this.persistLogs()
    this.notifyListeners()
  }

  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2)
  }

  downloadLogs() {
    const blob = new Blob([this.exportLogs()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `energy-dashboard-logs-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Error tracking helpers
  trackError(error: Error, context?: string, metadata?: Record<string, any>) {
    this.error(error.message, context, {
      ...metadata,
      stack: error.stack,
      name: error.name,
    })
  }

  trackApiError(url: string, status: number, statusText: string, response?: any) {
    this.error(`API Error: ${status} ${statusText}`, 'api', {
      url,
      status,
      statusText,
      response,
    })
  }

  trackComponentError(componentName: string, error: Error, errorInfo?: any) {
    this.error(`Component Error in ${componentName}`, 'react', {
      componentName,
      error: error.message,
      stack: error.stack,
      errorInfo,
    })
  }
}

// Create singleton instance
export const logger = new Logger()

// React hook for using logger in components
export { useLogger } from './useLogger'
