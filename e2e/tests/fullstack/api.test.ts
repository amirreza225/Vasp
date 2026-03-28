/**
 * REST API tests — exercises the auth and CRUD endpoints against the
 * real Elysia backend + Postgres database spun up by globalSetup.
 *
 * All Elysia responses are wrapped by the errorHandler middleware in either:
 *   Success: { ok: true, data: <payload> }
 *   Error:   { ok: false, error: { code, message } }
 *
 * Auth tests use the actual register/login flow (real JWTs + httpOnly cookies).
 * CRUD tests use public endpoints (no auth required in the e2e-todo fixture).
 * The magic token bypass is verified against public routes.
 */

import { test, expect } from '@playwright/test'

const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://localhost:3001'
const MAGIC = process.env.E2E_MAGIC_TOKEN ?? ''

/** Unwrap the { ok, data } envelope returned by the errorHandler middleware. */
function payload(body: unknown): unknown {
  if (body && typeof body === 'object' && 'data' in body) return (body as { data: unknown }).data
  return body
}

// ── Auth API ─────────────────────────────────────────────────────────────────

test.describe('Auth — register + login flow', () => {
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const username = `e2euser_${uniqueSuffix}`
  const password = 'E2ePassword123!'
  const email = `${username}@example.com`

  test('POST /api/auth/register creates a new user and returns 200', async ({ request }) => {
    const res = await request.post(`${BACKEND}/api/auth/register`, {
      data: { username, password, email },
    })
    expect(res.ok()).toBe(true)
    const body = await res.json()
    const user = payload(body) as Record<string, unknown>
    expect(user).toHaveProperty('username', username)
    expect(user).not.toHaveProperty('passwordHash')
  })

  test('POST /api/auth/register rejects duplicate username with 400', async ({ request }) => {
    // Register the same user a second time
    const res = await request.post(`${BACKEND}/api/auth/register`, {
      data: { username, password, email: `other_${email}` },
    })
    // Duplicate username → 400 or 409 depending on error path
    expect([400, 409]).toContain(res.status())
  })

  test('POST /api/auth/login with valid credentials returns 200', async ({ request }) => {
    const res = await request.post(`${BACKEND}/api/auth/login`, {
      data: { username, password },
    })
    expect(res.ok()).toBe(true)
    const body = await res.json()
    const user = payload(body) as Record<string, unknown>
    expect(user).toHaveProperty('username', username)
    expect(user).not.toHaveProperty('passwordHash')
  })

  test('POST /api/auth/login with wrong password returns 401', async ({ request }) => {
    const res = await request.post(`${BACKEND}/api/auth/login`, {
      data: { username, password: 'wrong-password' },
    })
    expect(res.status()).toBe(401)
  })

  test('POST /api/auth/login with unknown user returns 401', async ({ request }) => {
    const res = await request.post(`${BACKEND}/api/auth/login`, {
      data: { username: 'nobody_at_all_xyz', password },
    })
    expect(res.status()).toBe(401)
  })

  test('GET /api/auth/me without a token returns 401', async ({ request }) => {
    const res = await request.get(`${BACKEND}/api/auth/me`)
    expect(res.status()).toBe(401)
  })

  test('POST /api/auth/logout returns 200', async ({ request }) => {
    const res = await request.post(`${BACKEND}/api/auth/logout`)
    expect(res.ok()).toBe(true)
  })
})

// ── CRUD API — Todo resource ──────────────────────────────────────────────────

test.describe('CRUD — Todo resource', () => {
  // All CRUD routes require auth because `ast.auth` is defined in the fixture.
  // We use the E2E magic token so tests don't need a full register/login flow.
  const authHeaders = () => ({ Authorization: `Bearer ${MAGIC}` })

  test('GET /api/crud/todo returns 200 with a data array (in items key)', async ({ request }) => {
    const res = await request.get(`${BACKEND}/api/crud/todo`, { headers: authHeaders() })
    expect(res.ok()).toBe(true)
    const body = await res.json()
    // List endpoint returns { items: [...], total: n, limit: n, offset: n }
    // wrapped by errorHandler as { ok: true, data: { items: [...], ... } }
    const data = payload(body) as Record<string, unknown>
    expect(Array.isArray(data.items)).toBe(true)
  })

  test('POST /api/crud/todo creates a todo and returns it (201)', async ({ request }) => {
    const res = await request.post(`${BACKEND}/api/crud/todo`, {
      data: { title: 'E2E Test Todo', done: false },
      headers: authHeaders(),
    })
    expect(res.status()).toBe(201)
    const body = await res.json()
    const todo = payload(body) as Record<string, unknown>
    expect(todo).toHaveProperty('title', 'E2E Test Todo')
    expect(todo).toHaveProperty('done', false)
    expect(todo).toHaveProperty('id')
  })

  test('GET /api/crud/todo after create returns the created item', async ({ request }) => {
    const createRes = await request.post(`${BACKEND}/api/crud/todo`, {
      data: { title: 'Findable Todo', done: false },
      headers: authHeaders(),
    })
    expect(createRes.status()).toBe(201)
    const created = payload(await createRes.json()) as { id: number }
    expect(typeof created.id).toBe('number')

    const listRes = await request.get(`${BACKEND}/api/crud/todo`, { headers: authHeaders() })
    expect(listRes.ok()).toBe(true)
    const listPayload = payload(await listRes.json()) as { items: { id: number }[] }
    const found = listPayload.items.find((t) => t.id === created.id)
    expect(found).toBeDefined()
  })

  test('PUT /api/crud/todo/:id updates a todo', async ({ request }) => {
    const createRes = await request.post(`${BACKEND}/api/crud/todo`, {
      data: { title: 'Update Me', done: false },
      headers: authHeaders(),
    })
    expect(createRes.status()).toBe(201)
    const created = payload(await createRes.json()) as { id: number }
    expect(typeof created.id).toBe('number')

    const patchRes = await request.put(`${BACKEND}/api/crud/todo/${created.id}`, {
      data: { done: true },
      headers: authHeaders(),
    })
    expect(patchRes.ok()).toBe(true)
    const updated = payload(await patchRes.json()) as Record<string, unknown>
    expect(updated.done).toBe(true)
  })

  test('DELETE /api/crud/todo/:id removes the todo', async ({ request }) => {
    const createRes = await request.post(`${BACKEND}/api/crud/todo`, {
      data: { title: 'Delete Me', done: false },
      headers: authHeaders(),
    })
    expect(createRes.status()).toBe(201)
    const created = payload(await createRes.json()) as { id: number }
    expect(typeof created.id).toBe('number')

    const delRes = await request.delete(`${BACKEND}/api/crud/todo/${created.id}`, {
      headers: authHeaders(),
    })
    expect(delRes.ok()).toBe(true)

    const getRes = await request.get(`${BACKEND}/api/crud/todo/${created.id}`, {
      headers: authHeaders(),
    })
    expect(getRes.status()).toBe(404)
  })

  test('GET /api/crud/todo/:id for missing resource returns 404', async ({ request }) => {
    const res = await request.get(`${BACKEND}/api/crud/todo/999999`, { headers: authHeaders() })
    expect(res.status()).toBe(404)
  })

  test('CRUD route without auth returns 401 when auth is required', async ({ request }) => {
    const res = await request.get(`${BACKEND}/api/crud/todo`)
    expect(res.status()).toBe(401)
  })
})

// ── Magic token bypass ────────────────────────────────────────────────────────

test.describe('E2E magic token bypass', () => {
  test('Authorization: Bearer <magic> on a CRUD route is accepted', async ({ request }) => {
    const res = await request.get(`${BACKEND}/api/crud/todo`, {
      headers: { Authorization: `Bearer ${MAGIC}` },
    })
    expect(res.ok()).toBe(true)
  })

  test('Authorization: Bearer <wrong-token> on an auth-required route returns 401', async ({
    request,
  }) => {
    // Wrong token should not bypass auth — auth-required CRUD routes return 401
    const res = await request.get(`${BACKEND}/api/crud/todo`, {
      headers: { Authorization: 'Bearer wrong-token-xyz' },
    })
    expect(res.status()).toBe(401)
  })
})
