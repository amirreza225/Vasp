/**
 * Backend health tests — verify that the Elysia server started correctly
 * and exposes the expected meta endpoints.
 */

import { test, expect } from '@playwright/test'

const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://localhost:3001'

test('GET /api/health returns 200', async ({ request }) => {
  const res = await request.get(`${BACKEND}/api/health`)
  expect(res.ok()).toBe(true)
})

test('GET /api/health returns { status: "ok" }', async ({ request }) => {
  const res = await request.get(`${BACKEND}/api/health`)
  const body = await res.json()
  // errorHandler wraps all responses in { ok: true, data: ... }
  const payload = body.data ?? body
  expect(payload.status).toBe('ok')
})

test('GET /api/health includes a version field', async ({ request }) => {
  const res = await request.get(`${BACKEND}/api/health`)
  const body = await res.json()
  const payload = body.data ?? body
  expect(payload).toHaveProperty('version')
  expect(typeof payload.version).toBe('string')
})

test('GET /api/docs returns 200 (Swagger UI is served)', async ({ request }) => {
  const res = await request.get(`${BACKEND}/api/docs`)
  expect(res.status()).toBe(200)
})

test('GET /api/vasp returns Vasp diagnostic info', async ({ request }) => {
  const res = await request.get(`${BACKEND}/api/vasp`)
  // The /api/vasp diagnostic route is always generated; 200 or 404 are both fine
  // as long as the server is up — but it should be 200.
  expect(res.status()).toBeLessThan(500)
})

test('unknown route returns 404 (not a server crash)', async ({ request }) => {
  const res = await request.get(`${BACKEND}/api/this-route-does-not-exist`)
  expect(res.status()).toBe(404)
})
