import * as Sentry from '@sentry/electron/main'
import { logger, logError, logInfo } from './logger'

const SENTRY_DSN = process.env.SENTRY_DSN

let sentryEnabled = false

export function initMonitoring(appVersion: string) {
  if (!SENTRY_DSN) {
    logger.warn('SENTRY_DSN not set — error tracking disabled. Set SENTRY_DSN in .env to enable.')
    return
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    release: `optimanage-desktop@${appVersion}`,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.1,
    sampleRate: 1.0,
    beforeSend(event) {
      if (event.request?.data) {
        delete event.request.data
      }
      return event
    },
  })

  sentryEnabled = true
  logInfo('Sentry initialised', { release: `optimanage-desktop@${appVersion}` })
}

export function captureException(err: Error, context?: Record<string, unknown>) {
  logError(err.message, err, context)
  if (sentryEnabled) {
    Sentry.captureException(err, { extra: context })
  }
}

export function captureMessage(msg: string, level: Sentry.SeverityLevel = 'info') {
  logger.info(msg)
  if (sentryEnabled) {
    Sentry.captureMessage(msg, level)
  }
}

// ─── IPC Handler Timing Wrapper ──────────────────────────────────────────────

const SLOW_THRESHOLD_MS = 500

const handlerTimings = new Map<string, { count: number; totalMs: number; maxMs: number }>()

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
        logger.warn({ channel, elapsed: `${elapsed.toFixed(0)}ms`, args: args.length }, `Slow IPC handler: ${channel}`)
      }

      return result
    } catch (err: any) {
      const elapsed = performance.now() - start
      captureException(err, { channel, elapsed: `${elapsed.toFixed(0)}ms` })
      throw err
    }
  }
}

export function getIpcTimings(): Record<string, { count: number; avgMs: string; maxMs: number }> {
  const out: Record<string, { count: number; avgMs: string; maxMs: number }> = {}
  for (const [channel, stats] of handlerTimings) {
    out[channel] = {
      count: stats.count,
      avgMs: (stats.totalMs / stats.count).toFixed(1),
      maxMs: stats.maxMs,
    }
  }
  return out
}

export function closeMonitoring() {
  if (sentryEnabled) {
    Sentry.close(2000)
  }
}
