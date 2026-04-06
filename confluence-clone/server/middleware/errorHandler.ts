import { Elysia } from 'elysia'

/**
 * Standard error class for Vasp API routes.
 * Throw this from any route handler — the errorHandler middleware will
 * catch it and return a structured `{ ok: false, error: { ... } }` envelope.
 *
 * @example throw new VaspError('NOT_FOUND', 'Recipe not found', 404)
 */
export class VaspError extends Error {
  code: string
  statusCode: number
  hint?: string

  constructor(
    code: string,
    message: string,
    statusCode: number = 400,
    hint?: string,
  ) {
    super(message)
    this.name = 'VaspError'
    this.code = code
    this.statusCode = statusCode
    this.hint = hint
  }
}

/**
 * Global error handler + response envelope middleware.
 *
 * - `onError`       → catches thrown errors and returns `{ ok: false, error: { code, message, hint? } }`
 * - `onAfterHandle` → wraps successful responses in `{ ok: true, data: ... }`
 */
export function errorHandler() {
  return new Elysia({ name: 'vasp-error-handler' })
    .onError({ as: 'global' }, ({ code, error, set }) => {
      // VaspError — structured, expected error
      if (error instanceof VaspError) {
        set.status = error.statusCode
        return {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            ...(error.hint ? { hint: error.hint } : {}),
          },
        }
      }

      // Elysia built-in NOT_FOUND
      if (code === 'NOT_FOUND') {
        set.status = 404
        return { ok: false, error: { code: 'NOT_FOUND', message: 'Not found' } }
      }

      // Elysia validation error
      if (code === 'VALIDATION') {
        set.status = 400
        return {
          ok: false,
          error: { code: 'VALIDATION_FAILED', message: error.message },
        }
      }

      // Known PostgreSQL / Drizzle database errors — surface a user-friendly message.
      // PostgreSQL error codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
      const pgErr: Record<string, unknown> = error as Record<string, unknown>
      const pgCode = pgErr?.code
      if (typeof pgCode === 'string') {
        const detail = String(pgErr?.detail ?? '')
        if (pgCode === '23505') {
          set.status = 409
          return {
            ok: false,
            error: {
              code: 'UNIQUE_VIOLATION',
              message: detail ? `Unique constraint violation: ${detail}` : 'A record with this value already exists.',
            },
          }
        }
        if (pgCode === '23503') {
          set.status = 400
          return {
            ok: false,
            error: {
              code: 'FOREIGN_KEY_VIOLATION',
              message: detail ? `Foreign key constraint violation: ${detail}` : 'Referenced record does not exist.',
            },
          }
        }
        if (pgCode === '23502') {
          const column = String(pgErr?.column ?? '')
          set.status = 400
          return {
            ok: false,
            error: {
              code: 'NOT_NULL_VIOLATION',
              message: column ? `Field "${column}" cannot be null.` : 'A required field cannot be null.',
            },
          }
        }
        if (pgCode === '23514') {
          const constraint = String(pgErr?.constraint ?? '')
          set.status = 400
          return {
            ok: false,
            error: {
              code: 'CHECK_VIOLATION',
              message: constraint ? `Check constraint "${constraint}" was violated.` : 'A check constraint was violated.',
            },
          }
        }
      }

      // Unexpected error — log and mask (expose stack only in development)
      console.error('[server error]', error)
      set.status = 500
      return {
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
          ...(process.env.NODE_ENV === 'development'
            ? { stack: error instanceof Error ? error.stack : String(error) }
            : {}),
        },
      }
    })
    .onAfterHandle({ as: 'global' }, ({ response }) => {
      // Already wrapped (e.g. from onError or explicit envelope)
      if (response && typeof response === 'object' && 'ok' in response) return
      return { ok: true, data: response }
    })
}
