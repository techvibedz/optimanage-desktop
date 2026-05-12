export const logger = {
  info: (...args: any[]) => console.log('[INFO]', ...args),
  warn: (...args: any[]) => console.warn('[WARN]', ...args),
  error: (...args: any[]) => console.error('[ERROR]', ...args),
  debug: (...args: any[]) => console.log('[DEBUG]', ...args),
}

export function logInfo(msg: string, data?: Record<string, unknown>) {
  console.log('[INFO]', msg, data ? JSON.stringify(data) : '')
}

export function logWarn(msg: string, data?: Record<string, unknown>) {
  console.warn('[WARN]', msg, data ? JSON.stringify(data) : '')
}

export function logError(msg: string, err?: Error, data?: Record<string, unknown>) {
  console.error('[ERROR]', msg, err?.stack || err, data ? JSON.stringify(data) : '')
}

export function logDebug(msg: string, data?: Record<string, unknown>) {
  console.log('[DEBUG]', msg, data ? JSON.stringify(data) : '')
}
