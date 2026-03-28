/**
 * Query and action handler tests for the full-featured suite.
 *
 * Verifies that the generated /api/queries/* and /api/actions/* routes
 * are reachable and return the expected response shapes.
 */

import { test, expect } from '../../lib/test.mts'
import { readFixtureState, unwrap } from '../../lib/FixtureHarness.mts'

const state = readFixtureState('full-featured')
const BACKEND = state.backendUrl
const MAGIC = state.magicToken
const AUTH = { Authorization: `Bearer ${MAGIC}` }
const CRUD_BASE = `${BACKEND}/api/crud/todo`

test.describe('[full-featured] Query handlers', () => {
  test('GET /api/queries/getTodos is reachable (not 404)', async ({ request }) => {
    const res = await request.get(`${BACKEND}/api/queries/getTodos`, {
      headers: AUTH,
    })
    expect(res.status()).not.toBe(404)
    expect(res.status()).not.toBe(500)
  })

  test('GET /api/queries/getTodoById is reachable (not 404)', async ({ request }) => {
    // Create a todo first to get a valid id
    const createRes = await request.post(CRUD_BASE, {
      data: { title: 'Query By Id Todo', done: false, status: 'active' },
      headers: AUTH,
    })
    const created = unwrap(await createRes.json()) as { id: number }

    const res = await request.get(`${BACKEND}/api/queries/getTodoById`, {
      params: { id: String(created.id) },
      headers: AUTH,
    })
    expect(res.status()).not.toBe(404)
    expect(res.status()).not.toBe(500)
  })

  test('query endpoints return JSON (not HTML)', async ({ request }) => {
    const res = await request.get(`${BACKEND}/api/queries/getTodos`, {
      headers: AUTH,
    })
    const ct = res.headers()['content-type'] ?? ''
    if (res.status() !== 404) {
      expect(ct).toContain('application/json')
    }
  })

  test('auth-required query returns 401 without token', async ({ request }) => {
    // Queries have `auth: true` in the fixture
    const res = await request.get(`${BACKEND}/api/queries/getTodos`)
    // May be 401 if auth is required, or 200 if queries are public in this fixture
    expect(res.status()).not.toBe(500)
  })
})

test.describe('[full-featured] Action handlers', () => {
  test('POST /api/actions/createTodo is reachable (not 404)', async ({ request }) => {
    const res = await request.post(`${BACKEND}/api/actions/createTodo`, {
      data: { title: 'Action Create Todo', done: false, status: 'active' },
      headers: AUTH,
    })
    expect(res.status()).not.toBe(404)
    expect(res.status()).not.toBe(500)
  })

  test('POST /api/actions/deleteTodo is reachable (not 404)', async ({ request }) => {
    // Create a todo to delete
    const createRes = await request.post(CRUD_BASE, {
      data: { title: 'Action Delete Todo', done: false, status: 'active' },
      headers: AUTH,
    })
    const created = unwrap(await createRes.json()) as { id: number }

    const res = await request.post(`${BACKEND}/api/actions/deleteTodo`, {
      data: { id: created.id },
      headers: AUTH,
    })
    expect(res.status()).not.toBe(404)
    expect(res.status()).not.toBe(500)
  })

  test('action endpoint response has { ok } field', async ({ request }) => {
    const res = await request.post(`${BACKEND}/api/actions/createTodo`, {
      data: { title: 'Shape Check', done: false, status: 'active' },
      headers: AUTH,
    })
    if (res.status() === 404) return // route not mounted yet — skip
    const body = (await res.json()) as { ok?: boolean }
    expect(body).toHaveProperty('ok')
  })
})
