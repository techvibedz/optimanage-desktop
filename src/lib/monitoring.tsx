import * as Sentry from '@sentry/electron/renderer'
import React from 'react'
import { rendererLogger } from './logger'

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN
let sentryEnabled = false

export function initRendererMonitoring() {
  if (!SENTRY_DSN) {
    rendererLogger.info('VITE_SENTRY_DSN not set — renderer error tracking disabled')
    return
  }
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE || 'development',
    tracesSampleRate: 0.1,
    beforeSend(event) {
      if (event.request?.data) delete event.request.data
      return event
    },
  })
  sentryEnabled = true
  rendererLogger.info('Renderer Sentry initialised')
}

export function captureRendererError(err: Error, context?: Record<string, unknown>) {
  rendererLogger.error(err.message, err, context)
  if (sentryEnabled) Sentry.captureException(err, { extra: context })
}

// ─── React Error Boundary ────────────────────────────────────────────────────
interface ErrorBoundaryState { hasError: boolean; error: Error | null }

export class MonitoringErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    captureRendererError(error, { componentStack: info.componentStack })
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div style={{ padding: 40, textAlign: 'center', fontFamily: 'system-ui' }}>
          <h2>Something went wrong</h2>
          <p style={{ color: '#666' }}>The error has been logged. Please restart the application.</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ marginTop: 16, padding: '8px 24px', cursor: 'pointer' }}
          >
            Try Again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── Page Load Performance ───────────────────────────────────────────────────
export function trackPageLoad(pageName: string) {
  const start = performance.now()
  return () => {
    const elapsed = performance.now() - start
    rendererLogger.info(`Page loaded: ${pageName}`, { pageName, loadTimeMs: `${elapsed.toFixed(0)}ms` })
  }
}
