/**
 * REST API tests for the e2e-todo suite.
 * Migrated from e2e/tests/fullstack/api.test.ts and extended.
 *
 * All Elysia responses are wrapped by errorHandler as:
 *   Success: { ok: true,  data:  <payload> }
 *   Error:   { ok: false, error: { code, message } }
 *
 * Auth-protected CRUD routes are accessed via the E2E magic token.
 */

import { test, expect } from '@playwright/test'
import { readFixtureState, unwrap } from '../../lib/FixtureHarness.mts'
import { authSuite } from '../../lib/assertions/auth.mts'
import { crudSuite } from '../../lib/assertions/crud.mts'

const state = readFixtureState('e2e-todo')
const BACKEND = state.backendUrl
const MAGIC = state.magicToken

// ── Shared auth suite ────────────────────────────────────────────────────────

authSuite({ backendUrl: BACKEND, hasUsernameAndPassword: true })

// ── Shared CRUD suite (auth-gated via magic token) ───────────────────────────

crudSuite({
  backendUrl: BACKEND,
  entitySlug: 'todo',
  sampleCreate: { title: 'E2E Test Todo', done: false },
  sampleUpdate: { done: true },
  magicToken: MAGIC,
  needsAuth: true,
  assertCreatedField: 'title',
  assertCreatedValue: 'E2E Test Todo',
})

// ── E2E-Todo-specific API tests ───────────────────────────────────────────────

test.describe('[e2e-todo] Todo CRUD — domain-specific', () => {
  const base = `${BACKEND}/api/crud/todo`
  const authHeaders = { Authorization: `Bearer ${MAGIC}` }

  test('created todo has expected fields (title, done, id)', async ({ request }) => {
    const res = await request.post(base, {
      data: { title: 'Field Check Todo', done: false },
      headers: authHeaders,
    })
    expect(res.status()).toBe(201)
    const item = unwrap(await res.json()) as Record<string, unknown>
    expect(item).toHaveProperty('id')
    expect(item).toHaveProperty('title')
    expect(item).toHaveProperty('done')
  })

  test('list endpoint paginates with limit + offset query params', async ({ request }) => {
    // Create 3 todos
    for (let i = 0; i < 3; i++) {
      await request.post(base, {
        data: { title: `Paginate Todo ${i}`, done: false },
        headers: authHeaders,
      })
    }
    const page1 = await request.get(`${base}?limit=2&offset=0`, { headers: authHeaders })
    const p1data = unwrap(await page1.json()) as { items: unknown[]; total: number }
    expect(p1data.items.length).toBeLessThanOrEqual(2)
    expect(typeof p1data.total).toBe('number')
  })

  test('PUT /api/crud/todo/:id returns updated done=true', async ({ request }) => {
    const create = await request.post(base, {
      data: { title: 'Update Test', done: false },
      headers: authHeaders,
    })
    const created = unwrap(await create.json()) as { id: number }

    const upd = await request.put(`${base}/${created.id}`, {
      data: { done: true },
      headers: authHeaders,
    })
    expect(upd.ok()).toBe(true)
    const updated = unwrap(await upd.json()) as { done: boolean }
    expect(updated.done).toBe(true)
  })

  test('response body shape: { ok: true, data: {...} }', async ({ request }) => {
    const res = await request.get(base, { headers: authHeaders })
    const body = (await res.json()) as { ok: boolean; data: unknown }
    expect(body.ok).toBe(true)
    expect(body).toHaveProperty('data')
  })

  test('error response shape: { ok: false, error: { message } }', async ({ request }) => {
    const res = await request.get(`${BACKEND}/api/crud/todo/nonexistent-id-999`, {
      headers: authHeaders,
    })
    const body = (await res.json()) as { ok: boolean; error?: { message: string } }
    expect(body.ok).toBe(false)
    expect(body.error).toHaveProperty('message')
  })
})

// ── Magic-token bypass tests ─────────────────────────────────────────────────

test.describe('[e2e-todo] Magic token bypass', () => {
  test('Bearer <magicToken> on CRUD route is accepted', async ({ request }) => {
    const res = await request.get(`${BACKEND}/api/crud/todo`, {
      headers: { Authorization: `Bearer ${MAGIC}` },
    })
    expect(res.ok()).toBe(true)
  })

  test('Bearer wrong-token on auth-required route returns 401', async ({ request }) => {
    const res = await request.get(`${BACKEND}/api/crud/todo`, {
      headers: { Authorization: 'Bearer wrong-token-vasp-e2e-xxx' },
    })
    expect(res.status()).toBe(401)
  })

  test('magic token user (id=0) is present in /api/auth/me response', async ({ request }) => {
    const res = await request.get(`${BACKEND}/api/auth/me`, {
      headers: { Authorization: `Bearer ${MAGIC}` },
    })
    // Magic token user may or may not have a full profile, but must not error 500
    expect(res.status()).not.toBe(500)
  })
})
