import { Elysia } from 'elysia'

const isDev = process.env.NODE_ENV !== 'production'

/**
 * Vasp internal diagnostic routes.
 *
 * GET /api/_vasp/health — always available; returns uptime and version
 * GET /api/_vasp/debug  — only in dev (NODE_ENV !== 'production'); returns process info
 */
export const vaspDiagnosticRoutes = new Elysia({ prefix: '/api/_vasp' })
  .get('/health', ({ set }) => {
    set.headers['cache-control'] = 'no-store'
    return {
      ok: true,
      status: 'healthy',
      version: '1.2.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    }
  })
  .get('/debug', ({ set }) => {
    if (!isDev) {
      set.status = 404
      return { ok: false, error: { code: 'NOT_FOUND', message: 'Not found' } }
    }

    set.headers['cache-control'] = 'no-store'
    return {
      ok: true,
      env: process.env.NODE_ENV ?? 'unknown',
      nodeVersion: process.version,
      memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      pid: process.pid,
      cwd: process.cwd(),
    }
  })
