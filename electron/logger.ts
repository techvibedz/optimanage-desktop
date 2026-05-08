import pino from 'pino'
import { app } from 'electron'

const REDACTED = '***REDACTED***'

const SECRET_KEYS = new Set([
  'password', 'passwordHash', 'token', 'secret', 'apiKey', 'api_key',
  'authorization', 'auth', 'credential', 'privateKey', 'private_key',
  'accessToken', 'access_token', 'refreshToken', 'refresh_token',
])

const SECRET_PATTERNS = [
  /ghp_[a-zA-Z0-9]{36}/g,
  /sk-[a-zA-Z0-9]{32,}/g,
  /AIza[0-9A-Za-z\-_]{35}/g,
  /postgresql:\/\/[^:]+:[^@]+@/g,
]

function redactSecrets(obj: unknown): unknown {
  if (typeof obj === 'string') {
    let s = obj
    for (const pattern of SECRET_PATTERNS) {
      s = s.replace(pattern, (match) => {
        const colonIdx = match.indexOf(':')
        const atIdx = match.indexOf('@')
        if (colonIdx !== -1 && atIdx !== -1) {
          return match.slice(0, colonIdx + 1) + REDACTED + match.slice(atIdx)
        }
        return match.slice(0, 4) + REDACTED
      })
    }
    return s
  }
  if (Array.isArray(obj)) return obj.map(redactSecrets)
  if (obj !== null && typeof obj === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (SECRET_KEYS.has(key)) {
        out[key] = REDACTED
      } else {
        out[key] = redactSecrets(value)
      }
    }
    return out
  }
  return obj
}

const isDev = !app.isPackaged

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname',
      },
    },
  }),
  serializers: {
    err: pino.stdSerializers.err,
    obj: (value: unknown) => redactSecrets(value),
  },
  redact: {
    paths: [
      'password', 'passwordHash', 'token', 'secret', 'apiKey',
      'authorization', 'credential', '*.password', '*.token',
      '*.secret', '*.apiKey',
    ],
    censor: REDACTED,
  },
})

export function logInfo(msg: string, data?: Record<string, unknown>) {
  logger.info(data || {}, msg)
}

export function logWarn(msg: string, data?: Record<string, unknown>) {
  logger.warn(data || {}, msg)
}

export function logError(msg: string, err?: Error, data?: Record<string, unknown>) {
  logger.error({ err, ...(data || {}) }, msg)
}

export function logDebug(msg: string, data?: Record<string, unknown>) {
  logger.debug(data || {}, msg)
}
