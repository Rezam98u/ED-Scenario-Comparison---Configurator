import { useState, useMemo } from 'react'
import { useLogger } from '../utils/useLogger'
import type { LogEntry } from '../utils/logger'

interface ErrorConsoleProps {
  isOpen: boolean
  onToggle: () => void
  className?: string
}

const LOG_LEVEL_COLORS = {
  error: 'text-red-600 bg-red-50 border-red-200',
  warn: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  info: 'text-blue-600 bg-blue-50 border-blue-200',
  debug: 'text-gray-600 bg-gray-50 border-gray-200',
}

const LOG_LEVEL_ICONS = {
  error: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  warn: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.232 16.5c-.77.833.192 2.5 1.732 2.5z" />
    </svg>
  ),
  info: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  debug: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
}

function LogEntryComponent({ log, isExpanded, onToggle }: { 
  log: LogEntry
  isExpanded: boolean
  onToggle: () => void 
}) {
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }) + '.' + String(date.getMilliseconds()).padStart(3, '0')
  }

  const hasDetails = log.metadata || log.stack

  return (
    <div className={`border rounded-lg p-3 ${LOG_LEVEL_COLORS[log.level]}`}>
      <div 
        className={`flex items-start gap-3 ${hasDetails ? 'cursor-pointer' : ''}`}
        onClick={hasDetails ? onToggle : undefined}
      >
        <div className="flex-shrink-0 mt-0.5">
          {LOG_LEVEL_ICONS[log.level]}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-medium text-xs uppercase tracking-wide">
                {log.level}
              </span>
              {log.context && (
                <span className="text-xs bg-white/60 px-2 py-0.5 rounded-full">
                  {log.context}
                </span>
              )}
            </div>
            <span className="text-xs opacity-75 flex-shrink-0">
              {formatTime(log.timestamp)}
            </span>
          </div>
          
          <p className="text-sm mt-1 break-words">
            {log.message}
          </p>
          
          {hasDetails && (
            <div className="flex items-center gap-1 mt-2 text-xs opacity-75">
              <span>{isExpanded ? 'Hide' : 'Show'} details</span>
              <svg 
                className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          )}
        </div>
      </div>
      
      {isExpanded && hasDetails && (
        <div className="mt-3 pt-3 border-t border-current/20">
          {log.metadata && (
            <div className="mb-3">
              <h4 className="text-xs font-medium mb-1">Metadata:</h4>
              <pre className="text-xs bg-white/40 p-2 rounded overflow-auto max-h-40">
                {JSON.stringify(log.metadata, null, 2)}
              </pre>
            </div>
          )}
          
          {log.stack && (
            <div>
              <h4 className="text-xs font-medium mb-1">Stack Trace:</h4>
              <pre className="text-xs bg-white/40 p-2 rounded overflow-auto max-h-40">
                {log.stack}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function ErrorConsole({ isOpen, onToggle, className = '' }: ErrorConsoleProps) {
  const { logs, errors, warnings, clearLogs, downloadLogs } = useLogger()
  const [filter, setFilter] = useState<'all' | 'error' | 'warn' | 'info' | 'debug'>('all')
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set())

  const filteredLogs = useMemo(() => {
    if (filter === 'all') return logs
    return logs.filter(log => log.level === filter)
  }, [logs, filter])

  const errorCount = errors.length
  const warningCount = warnings.length
  const totalCount = logs.length

  const toggleLogExpansion = (logId: string) => {
    setExpandedLogs(prev => {
      const newSet = new Set(prev)
      if (newSet.has(logId)) {
        newSet.delete(logId)
      } else {
        newSet.add(logId)
      }
      return newSet
    })
  }

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className={`fixed bottom-4 right-4 z-50 bg-red-600 text-white rounded-full p-3 shadow-lg hover:bg-red-700 transition-all duration-200 ${className}`}
        title={`${errorCount} errors, ${warningCount} warnings`}
      >
        <div className="relative">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {errorCount > 0 && (
            <span className="absolute -top-2 -right-2 bg-yellow-500 text-black text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
              {errorCount > 99 ? '99+' : errorCount}
            </span>
          )}
        </div>
      </button>
    )
  }

  return (
    <div className={`fixed bottom-4 right-4 z-50 bg-white rounded-lg shadow-2xl border border-gray-200 ${className}`}>
      <div className="w-96 h-96 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50 rounded-t-lg">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-gray-900">Error Console</h3>
            <div className="flex items-center gap-2 text-xs">
              <span className="bg-red-100 text-red-800 px-2 py-1 rounded-full">
                {errorCount} errors
              </span>
              <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">
                {warningCount} warnings
              </span>
            </div>
          </div>
          
          <button
            onClick={onToggle}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-1 p-2 border-b border-gray-200">
          {(['all', 'error', 'warn', 'info', 'debug'] as const).map((level) => (
            <button
              key={level}
              onClick={() => setFilter(level)}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                filter === level
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {level} ({level === 'all' ? totalCount : logs.filter(log => log.level === level).length})
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 p-2 border-b border-gray-200 bg-gray-50">
          <button
            onClick={clearLogs}
            disabled={logs.length === 0}
            className="text-xs bg-gray-600 text-white px-3 py-1 rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Clear All
          </button>
          <button
            onClick={downloadLogs}
            disabled={logs.length === 0}
            className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Export
          </button>
          <span className="text-xs text-gray-500 ml-auto">
            {filteredLogs.length} entries
          </span>
        </div>

        {/* Log Entries */}
        <div className="flex-1 overflow-auto p-3 space-y-2">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <svg className="w-8 h-8 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm">No {filter !== 'all' ? filter : ''} logs found</p>
            </div>
          ) : (
            filteredLogs.map((log) => (
              <LogEntryComponent
                key={log.id}
                log={log}
                isExpanded={expandedLogs.has(log.id)}
                onToggle={() => toggleLogExpansion(log.id)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
