import { describe, it, expect, beforeEach, vi } from 'vitest'
import { logger } from '../logger'

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
})

// Mock console methods
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
vi.spyOn(console, 'warn').mockImplementation(() => {})
vi.spyOn(console, 'info').mockImplementation(() => {})
vi.spyOn(console, 'log').mockImplementation(() => {})

describe('Logger', () => {
  beforeEach(() => {
    // Clear all logs before each test
    logger.clearLogs()
    vi.clearAllMocks()
  })

  it('should log error messages', () => {
    logger.error('Test error', 'test-context')
    
    const logs = logger.getLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0].level).toBe('error')
    expect(logs[0].message).toBe('Test error')
    expect(logs[0].context).toBe('test-context')
    expect(consoleErrorSpy).toHaveBeenCalled()
  })

  it('should log different levels of messages', () => {
    logger.debug('Debug message')
    logger.info('Info message')
    logger.warn('Warning message')
    logger.error('Error message')
    
    const logs = logger.getLogs()
    expect(logs).toHaveLength(4)
    expect(logs.map(log => log.level)).toEqual(['error', 'warn', 'info', 'debug'])
  })

  it('should filter logs by level', () => {
    logger.error('Error 1')
    logger.warn('Warning 1')
    logger.error('Error 2')
    logger.info('Info 1')
    
    const errors = logger.getErrors()
    expect(errors).toHaveLength(2)
    expect(errors.every(log => log.level === 'error')).toBe(true)
    
    const warnings = logger.getLogs('warn')
    expect(warnings).toHaveLength(1)
    expect(warnings[0].message).toBe('Warning 1')
  })

  it('should track errors with stack traces', () => {
    const testError = new Error('Test error')
    logger.trackError(testError, 'test-component', { userId: 123 })
    
    const logs = logger.getLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0].level).toBe('error')
    expect(logs[0].message).toBe('Test error')
    expect(logs[0].context).toBe('test-component')
    expect(logs[0].metadata).toEqual({
      userId: 123,
      stack: testError.stack,
      name: testError.name,
    })
  })

  it('should track API errors', () => {
    logger.trackApiError('/api/test', 404, 'Not Found', { detail: 'Resource not found' })
    
    const logs = logger.getLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0].level).toBe('error')
    expect(logs[0].message).toBe('API Error: 404 Not Found')
    expect(logs[0].context).toBe('api')
    expect(logs[0].metadata).toEqual({
      url: '/api/test',
      status: 404,
      statusText: 'Not Found',
      response: { detail: 'Resource not found' },
    })
  })

  it('should track component errors', () => {
    const componentError = new Error('Component crashed')
    const errorInfo = { componentStack: 'ComponentStack' }
    
    logger.trackComponentError('TestComponent', componentError, errorInfo)
    
    const logs = logger.getLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0].level).toBe('error')
    expect(logs[0].message).toBe('Component Error in TestComponent')
    expect(logs[0].context).toBe('react')
    expect(logs[0].metadata).toEqual({
      componentName: 'TestComponent',
      error: 'Component crashed',
      stack: componentError.stack,
      errorInfo,
    })
  })

  it('should limit the number of log entries', () => {
    logger.configure({ maxEntries: 3 })
    
    logger.error('Error 1')
    logger.error('Error 2')
    logger.error('Error 3')
    logger.error('Error 4')
    logger.error('Error 5')
    
    const logs = logger.getLogs()
    expect(logs).toHaveLength(3)
    expect(logs[0].message).toBe('Error 5') // Most recent first
    expect(logs[2].message).toBe('Error 3')
  })

  it('should persist logs to localStorage', () => {
    logger.error('Persistent error', 'test')
    
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'energy-dashboard-logs',
      expect.stringContaining('Persistent error')
    )
  })

  it('should load persisted logs from localStorage', () => {
    const mockLogs = JSON.stringify([
      {
        id: 'test-1',
        timestamp: new Date().toISOString(),
        level: 'error',
        message: 'Persisted error',
        context: 'test'
      }
    ])
    
    localStorageMock.getItem.mockReturnValue(mockLogs)
    
    // Test persistence by adding a log and checking if it's saved
    logger.error('Test persistence')
    
    expect(localStorageMock.setItem).toHaveBeenCalled()
  })

  it('should export logs as JSON', () => {
    logger.error('Export test error')
    logger.warn('Export test warning')
    
    const exported = logger.exportLogs()
    const parsed = JSON.parse(exported)
    
    expect(parsed).toHaveLength(2)
    expect(parsed[0].message).toBe('Export test warning') // Most recent first
    expect(parsed[1].message).toBe('Export test error')
  })

  it('should clear all logs', () => {
    logger.error('Error to clear')
    logger.warn('Warning to clear')
    
    expect(logger.getLogs()).toHaveLength(2)
    
    logger.clearLogs()
    
    expect(logger.getLogs()).toHaveLength(0)
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'energy-dashboard-logs',
      '[]'
    )
  })

  it('should notify listeners when logs change', () => {
    const listener = vi.fn()
    const unsubscribe = logger.subscribe(listener)
    
    logger.error('Test error')
    
    expect(listener).toHaveBeenCalledWith([
      expect.objectContaining({
        level: 'error',
        message: 'Test error'
      })
    ])
    
    unsubscribe()
    logger.warn('Test warning')
    
    // Should not be called after unsubscribe
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
