import { logger, logInfo, logWarn, logError } from './logger'

let sentryEnabled = false

export function initMonitoring(appVersion: string) {
  const dsn = process.env.SENTRY_DSN
  if (!dsn) {
    logInfo('SENTRY_DSN not set — error tracking disabled')
    return
  }

  try {
    const Sentry = require('@sentry/electron/main')
    Sentry.init({
      dsn,
      release: `optimanage-desktop@${appVersion}`,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: 0.1,
      sampleRate: 1.0,
      beforeSend(event: any) {
        if (event.request?.data) delete event.request.data
        return event
      },
    })
    sentryEnabled = true
    logInfo('Sentry initialised', { release: `optimanage-desktop@${appVersion}` })
  } catch (err: any) {
    logWarn('Failed to init Sentry', { error: err.message })
  }
}

export function captureException(err: Error, context?: Record<string, unknown>) {
  if (sentryEnabled) {
    try {
      const Sentry = require('@sentry/electron/main')
      Sentry.captureException(err, { extra: context })
    } catch { /* ignore */ }
  }
  logError(err.message, err, context)
}

export function captureMessage(msg: string, level: string = 'info') {
  logInfo(msg)
  if (sentryEnabled) {
    try {
      const Sentry = require('@sentry/electron/main')
      Sentry.captureMessage(msg, level)
    } catch { /* ignore */ }
  }
}

const handlerTimings = new Map<string, { count: number; totalMs: number; maxMs: number }>()

const SLOW_THRESHOLD_MS = 500

export function wrapIpcHandler<TArgs extends any[], TRet>(
  channel: string,
  handler: (...args: TArgs) => Promise<TRet>,
): (...args: TArgs) => Promise<TRet> {
  return async (...args: TArgs) => {
    const start = performance.now()
    try {
      const result = await handler(...args)
      const elapsed = performance.now() - start
      const stats = handlerTimings.get(channel) || { count: 0, totalMs: 0, maxMs: 0 }
      stats.count++
      stats.totalMs += elapsed
      if (elapsed > stats.maxMs) stats.maxMs = elapsed
      handlerTimings.set(channel, stats)
      if (elapsed > SLOW_THRESHOLD_MS) {
        logWarn(`Slow IPC: ${channel}`, { channel, elapsed: `${elapsed.toFixed(0)}ms` })
      }
      return result
    } catch (err: any) {
      captureException(err, { channel, elapsed: `${(performance.now() - start).toFixed(0)}ms` })
      throw err
    }
  }
}

export function getIpcTimings(): Record<string, { count: number; avgMs: string; maxMs: number }> {
  const out: Record<string, { count: number; avgMs: string; maxMs: number }> = {}
  for (const [channel, stats] of handlerTimings) {
    out[channel] = { count: stats.count, avgMs: (stats.totalMs / stats.count).toFixed(1), maxMs: stats.maxMs }
  }
  return out
}

export function closeMonitoring() {
  if (sentryEnabled) {
    try {
      const Sentry = require('@sentry/electron/main')
      Sentry.close(2000)
    } catch { /* ignore */ }
  }
}
