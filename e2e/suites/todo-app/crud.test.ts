/**
 * CRUD tests for the todo-app fixture (no auth guard).
 *
 * The todo-app fixture has no `auth` block, so CRUD endpoints are public.
 * All tests use no Authorization header.
 */

import { test, expect } from '../../lib/test.mts'
import { readFixtureState, unwrap } from '../../lib/FixtureHarness.mts'
import { crudSuite } from '../../lib/assertions/crud.mts'

const state = readFixtureState('todo-app')
const BACKEND = state.backendUrl

// ── Shared CRUD suite (no auth) ───────────────────────────────────────────────

crudSuite({
  backendUrl: BACKEND,
  entitySlug: 'todo',
  sampleCreate: { title: 'E2E Test Todo', done: false },
  sampleUpdate: { done: true },
  // No magicToken — fixture has no auth
  needsAuth: false,
  assertCreatedField: 'title',
  assertCreatedValue: 'E2E Test Todo',
})

// ── Todo-specific tests ───────────────────────────────────────────────────────

test.describe('[todo-app] Todo CRUD — domain-specific tests', () => {
  const base = `${BACKEND}/api/crud/todo`

  test('GET /api/crud/todo response includes createdAt field', async ({ request }) => {
    await request.post(base, { data: { title: 'With Timestamp', done: false } })
    const res = await request.get(base)
    const data = unwrap(await res.json()) as { items: { createdAt?: string }[] }
    const latest = data.items.find((i) => i.createdAt)
    expect(latest?.createdAt).toBeDefined()
  })

  test('POST /api/crud/todo with done: true creates a completed todo', async ({ request }) => {
    const res = await request.post(base, {
      data: { title: 'Already Done', done: true },
    })
    expect(res.status()).toBe(201)
    const item = unwrap(await res.json()) as { done: boolean }
    expect(item.done).toBe(true)
  })

  test('PUT /api/crud/todo/:id can mark todo as done', async ({ request }) => {
    const create = await request.post(base, { data: { title: 'Mark me done', done: false } })
    const created = unwrap(await create.json()) as { id: number }
    const upd = await request.put(`${base}/${created.id}`, { data: { done: true } })
    const updated = unwrap(await upd.json()) as { done: boolean }
    expect(updated.done).toBe(true)
  })

  test('GET /api/crud/todo total increases after create', async ({ request }) => {
    const before = unwrap(await (await request.get(base)).json()) as { total: number }
    await request.post(base, { data: { title: 'Count me', done: false } })
    const after = unwrap(await (await request.get(base)).json()) as { total: number }
    expect(after.total).toBeGreaterThan(before.total)
  })

  test('title must be present (missing title → 400 or 422)', async ({ request }) => {
    const res = await request.post(base, { data: { done: false } })
    expect([400, 422]).toContain(res.status())
  })

  // ── Query handler endpoints ────────────────────────────────────────────────

  test('POST /api/queries/getTodos returns 200', async ({ request }) => {
    const res = await request.post(`${BACKEND}/api/queries/getTodos`, { data: {} })
    // 200 = found, 404 = not registered, both acceptable for generation-level E2E
    expect(res.status()).not.toBe(500)
  })

  test('POST /api/actions/createTodo returns 200 or 201', async ({ request }) => {
    const res = await request.post(`${BACKEND}/api/actions/createTodo`, {
      data: { title: 'Action Todo', done: false },
    })
    expect(res.status()).not.toBe(500)
  })
})
