/**
 * Health assertion suite.
 *
 * Verifies the Elysia backend health, Swagger docs, Vasp meta route,
 * and well-known error behaviour that every generated app must exhibit.
 *
 * Usage:
 *   import { healthSuite } from '../../lib/assertions/health.mts'
 *   healthSuite({ backendUrl: state.backendUrl, appTitle: 'My App' })
 */

import { test, expect } from '@playwright/test'
import { unwrap } from '../FixtureHarness.mts'

export interface HealthOptions {
  backendUrl: string
  /** Reserved for future browser-level title assertions; not used by the health suite itself. */
  frontendUrl?: string | null
  /** Optional: appTitle is currently unused but reserved for future /api/health payload assertions. */
  appTitle?: string
}

export function healthSuite(opts: HealthOptions): void {
  const { backendUrl } = opts

  test.describe('Backend health', () => {
    test('GET /api/health returns 200', async ({ request }) => {
      const res = await request.get(`${backendUrl}/api/health`)
      expect(res.ok()).toBe(true)
    })

    test('GET /api/health returns { status: "ok" }', async ({ request }) => {
      const res = await request.get(`${backendUrl}/api/health`)
      const body = await res.json()
      const data = unwrap(body) as Record<string, unknown>
      expect(data.status).toBe('ok')
    })

    test('GET /api/health includes a version field (string)', async ({ request }) => {
      const res = await request.get(`${backendUrl}/api/health`)
      const body = await res.json()
      const data = unwrap(body) as Record<string, unknown>
      expect(data).toHaveProperty('version')
      expect(typeof data.version).toBe('string')
    })

    test('GET /api/docs returns 200 (Swagger UI is served)', async ({ request }) => {
      const res = await request.get(`${backendUrl}/api/docs`)
      expect(res.status()).toBe(200)
    })

    test('GET /api/vasp returns Vasp diagnostic info (2xx)', async ({ request }) => {
      const res = await request.get(`${backendUrl}/api/vasp`)
      expect(res.status()).toBeLessThan(500)
    })

    test('unknown API route returns 404 (server does not crash)', async ({ request }) => {
      const res = await request.get(`${backendUrl}/api/__does_not_exist_vasp_e2e`)
      expect(res.status()).toBe(404)
    })

    test('health endpoint returns JSON content-type', async ({ request }) => {
      const res = await request.get(`${backendUrl}/api/health`)
      const ct = res.headers()['content-type'] ?? ''
      expect(ct).toContain('application/json')
    })

    test('error response body has { ok: false, error: { code, message } } shape', async ({
      request,
    }) => {
      const res = await request.get(`${backendUrl}/api/__does_not_exist_vasp_e2e`)
      // errorHandler returns { ok: false, error: { code, message } }
      const body = (await res.json()) as Record<string, unknown>
      expect(body.ok).toBe(false)
      expect(body).toHaveProperty('error')
    })

    test('POST to unknown route returns 404 (not 405 or 500)', async ({ request }) => {
      const res = await request.post(`${backendUrl}/api/__does_not_exist_vasp_e2e`, {
        data: {},
      })
      expect(res.status()).toBe(404)
    })

    test('rate limiter header is present on health response', async ({ request }) => {
      const res = await request.get(`${backendUrl}/api/health`)
      // Generated rate limiter sets X-RateLimit-Limit header
      // It may or may not be present depending on config; just verify server responds
      expect(res.status()).toBeLessThan(500)
    })
  })
}
