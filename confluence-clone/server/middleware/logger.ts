import { Elysia } from 'elysia'
import crypto from 'node:crypto'
import { trace, context, propagation } from '@opentelemetry/api'
import { httpRequestCounter, httpRequestDuration, errorCounter } from '../telemetry/metrics.ts'

const isDev = process.env.NODE_ENV !== 'production'


/** Extract W3C traceparent from the current active span */
function getTraceparent(): string | undefined {
  const span = trace.getActiveSpan()
  if (!span) return undefined
  const ctx = span.spanContext()
  if (!trace.isSpanContextValid(ctx)) return undefined
  const flags = ctx.traceFlags.toString(16).padStart(2, '0')
  return `00-${ctx.traceId}-${ctx.spanId}-${flags}`
}

/** Extract traceId from the current active span (for correlation IDs) */
export function getCurrentTraceId(): string | undefined {
  const span = trace.getActiveSpan()
  if (!span) return undefined
  const ctx = span.spanContext()
  return trace.isSpanContextValid(ctx) ? ctx.traceId : undefined
}

function logJson(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), ...fields }))
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
      // Restore OTel trace context propagated by upstream callers (W3C traceparent/tracestate)
      const carrier: Record<string, string> = {}
      request.headers.forEach((value, key) => { carrier[key] = value })
      const parentCtx = propagation.extract(context.active(), carrier)
      const tracer = trace.getTracer('ConfluenceClone')
      const span = tracer.startSpan(
        `${request.method} ${new URL(request.url).pathname}`,
        {},
        parentCtx,
      )
      return {
        requestId,
        requestStart: performance.now(),
        _span: span,
      }
    })
    .onAfterHandle({ as: 'scoped' }, ({ request, requestId, requestStart, _span, set }) => {
      set.headers['x-request-id'] = requestId
      const traceparent = getTraceparent()
      if (traceparent) set.headers['traceparent'] = traceparent

      const duration = parseFloat((performance.now() - requestStart).toFixed(1))
      const url = new URL(request.url)
      const status = typeof set.status === 'number' ? set.status : 200
      const method = request.method
      const path = url.pathname

      httpRequestCounter.add(1, { method, path, status: String(status) })
      httpRequestDuration.record(duration, { method, path, status: String(status) })
      if (_span) {
        _span.setAttribute('http.method', method)
        _span.setAttribute('http.route', path)
        _span.setAttribute('http.status_code', status)
        _span.setAttribute('http.request_id', requestId)
        _span.end()
      }

      logJson({
        level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
        type: 'http',
        method,
        path,
        status,
        durationMs: duration,
        requestId,
        traceId: getCurrentTraceId(),
      })
    })
    .onError({ as: 'scoped' }, ({ request, requestId, requestStart, _span, set, error }) => {
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

      httpRequestCounter.add(1, { method, path, status: String(status) })
      httpRequestDuration.record(duration, { method, path, status: String(status) })
      if (status >= 500) errorCounter.add(1, { path, type: error.constructor?.name ?? 'Error' })
      if (_span) {
        _span.setAttribute('http.status_code', status)
        _span.setAttribute('error', true)
        _span.setAttribute('error.message', error instanceof Error ? error.message : String(error))
        _span.end()
      }

      logJson({
        level: 'error',
        type: 'http',
        method,
        path,
        status,
        durationMs: duration,
        requestId: rid,
        error: error instanceof Error ? error.message : String(error),
        traceId: getCurrentTraceId(),
      })
    })
}
