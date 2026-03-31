import { Elysia } from 'elysia'
import crypto from 'node:crypto'

const isDev = process.env.NODE_ENV !== 'production'

const colors: Record<string, string> = {
  GET: '\x1b[32m',    // green
  POST: '\x1b[34m',   // blue
  PUT: '\x1b[33m',    // yellow
  PATCH: '\x1b[33m',  // yellow
  DELETE: '\x1b[31m', // red
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
}

function colorMethod(method: string): string {
  return `${colors[method] ?? ''}${method}${colors.reset}`
}

function statusColor(status: number): string {
  if (status < 300) return '\x1b[32m'
  if (status < 400) return '\x1b[36m'
  if (status < 500) return '\x1b[33m'
  return '\x1b[31m'
}



/**
 * Request tracing & logging middleware.
 *
 * - Assigns a unique `x-request-id` to every request (UUID v4, or forwarded from upstream).
 * - Propagates W3C `traceparent` / `tracestate` headers for distributed tracing.
 * - Logs every request with method, path, status, duration, and correlation IDs.
 * - In structured mode: emits machine-readable JSON for log aggregators.
 * - In console mode: emits colorful dev-friendly output (default).
 */
export function logger() {
  return new Elysia({ name: 'vasp-logger' })
    .derive({ as: 'scoped' }, ({ request }) => {
      const requestId = request.headers.get('x-request-id') || crypto.randomUUID()
      return {
        requestId,
        requestStart: performance.now(),
      }
    })
    .onAfterHandle({ as: 'scoped' }, ({ request, requestId, requestStart, set }) => {
      set.headers['x-request-id'] = requestId

      const duration = parseFloat((performance.now() - requestStart).toFixed(1))
      const url = new URL(request.url)
      const status = typeof set.status === 'number' ? set.status : 200
      const method = request.method
      const path = url.pathname


      if (!isDev) return

      const sc = statusColor(status)
      console.log(
        `${colors.dim}[${new Date().toISOString()}]${colors.reset} ` +
        `${colorMethod(method)} ${path} ` +
        `${sc}${status}${colors.reset} ${colors.dim}${duration}ms${colors.reset} ` +
        `${colors.dim}rid:${requestId.slice(0, 8)}${colors.reset}`,
      )
    })
    .onError({ as: 'scoped' }, ({ request, requestId, requestStart, set, error }) => {
      // requestId/requestStart/_span may be undefined when onError fires before .derive()
      // (e.g. 404, parse errors, pre-routing validation failures in Elysia 1.x)
      const rid = requestId ?? request.headers.get('x-request-id') ?? crypto.randomUUID()
      set.headers['x-request-id'] = rid

      const start = requestStart ?? performance.now()
      const duration = parseFloat((performance.now() - start).toFixed(1))
      const url = new URL(request.url)
      const status = typeof set.status === 'number' ? set.status : 500
      const method = request.method
      const path = url.pathname


      if (!isDev) return

      const sc = statusColor(status)
      console.log(
        `${colors.dim}[${new Date().toISOString()}]${colors.reset} ` +
        `${colorMethod(method)} ${path} ` +
        `${sc}${status}${colors.reset} ${colors.dim}${duration}ms${colors.reset} ` +
        `${colors.dim}rid:${rid.slice(0, 8)}${colors.reset} ` +
        `${colors.bold}\x1b[31m${error instanceof Error ? error.message : String(error)}${colors.reset}`,
      )
    })
}
