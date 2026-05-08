type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  message: string
  timestamp: string
  data?: Record<string, unknown>
}

const LOG_LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

const currentLevel: LogLevel = (import.meta.env.VITE_LOG_LEVEL as LogLevel) || 'info'
const minLevel = LOG_LEVEL_ORDER[currentLevel] ?? 1

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_ORDER[level] >= minLevel
}

function formatEntry(entry: LogEntry): string {
  const prefix = `[${entry.timestamp}] ${entry.level.toUpperCase()}`
  const dataStr = entry.data ? ' ' + JSON.stringify(entry.data) : ''
  return `${prefix} ${entry.message}${dataStr}`
}

function createEntry(level: LogLevel, message: string, data?: Record<string, unknown>): LogEntry {
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    data,
  }
}

function emit(entry: LogEntry) {
  if (!shouldLog(entry.level)) return
  const formatted = formatEntry(entry)

  switch (entry.level) {
    case 'error':
      console.error(formatted)
      break
    case 'warn':
      console.warn(formatted)
      break
    case 'info':
      console.info(formatted)
      break
    case 'debug':
    default:
      console.debug(formatted)
      break
  }
}

export const rendererLogger = {
  debug(msg: string, data?: Record<string, unknown>) {
    emit(createEntry('debug', msg, data))
  },
  info(msg: string, data?: Record<string, unknown>) {
    emit(createEntry('info', msg, data))
  },
  warn(msg: string, data?: Record<string, unknown>) {
    emit(createEntry('warn', msg, data))
  },
  error(msg: string, err?: Error, data?: Record<string, unknown>) {
    emit(createEntry('error', msg, { ...(data || {}), errorMessage: err?.message }))
  },
}
