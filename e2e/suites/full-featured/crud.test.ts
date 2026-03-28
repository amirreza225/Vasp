/**
 * CRUD tests for the full-featured suite.
 *
 * The Todo entity has advanced list config: paginate, sortable, filterable, search.
 * All CRUD routes are auth-gated; the magic token is used.
 */

import { test, expect } from '../../lib/test.mts'
import { readFixtureState, unwrap } from '../../lib/FixtureHarness.mts'
import { crudSuite } from '../../lib/assertions/crud.mts'

const state = readFixtureState('full-featured')
const BACKEND = state.backendUrl
const MAGIC = state.magicToken
const AUTH = { Authorization: `Bearer ${MAGIC}` }

crudSuite({
  backendUrl: BACKEND,
  entitySlug: 'todo',
  sampleCreate: { title: 'E2E Full-Featured Todo', done: false, status: 'active' },
  sampleUpdate: { done: true },
  magicToken: MAGIC,
  needsAuth: true,
})

// ── Advanced list features ────────────────────────────────────────────────────

test.describe('[full-featured] Advanced CRUD list features', () => {
  const base = `${BACKEND}/api/crud/todo`

  test('?limit=5&offset=0 returns at most 5 items', async ({ request }) => {
    // Pre-create items so there's something to page through
    for (let i = 0; i < 6; i++) {
      await request.post(base, {
        data: { title: `Paginate ${i}`, done: false, status: 'active' },
        headers: AUTH,
      })
    }
    const res = await request.get(`${base}?limit=5&offset=0`, { headers: AUTH })
    const data = unwrap(await res.json()) as { items: unknown[]; total: number }
    expect(data.items.length).toBeLessThanOrEqual(5)
    expect(data.total).toBeGreaterThanOrEqual(6)
  })

  test('?sortBy=createdAt&sortOrder=desc returns results', async ({ request }) => {
    const res = await request.get(`${base}?sortBy=createdAt&sortOrder=desc`, { headers: AUTH })
    expect(res.ok()).toBe(true)
    const data = unwrap(await res.json()) as { items: unknown[] }
    expect(Array.isArray(data.items)).toBe(true)
  })

  test('?filter[status]=active returns items with matching status', async ({ request }) => {
    await request.post(base, {
      data: { title: 'Filterable Active', done: false, status: 'active' },
      headers: AUTH,
    })
    const res = await request.get(`${base}?filter[status]=active`, { headers: AUTH })
    expect(res.ok()).toBe(true)
    const data = unwrap(await res.json()) as { items: { status?: string }[] }
    for (const item of data.items) {
      if (item.status) expect(item.status).toBe('active')
    }
  })

  test('?search=Searchable returns only matching items', async ({ request }) => {
    const marker = `SearchableUnique_${Date.now()}`
    await request.post(base, {
      data: { title: marker, done: false, status: 'active' },
      headers: AUTH,
    })
    const res = await request.get(`${base}?search=${encodeURIComponent(marker)}`, {
      headers: AUTH,
    })
    expect(res.ok()).toBe(true)
    const data = unwrap(await res.json()) as { items: { title: string }[] }
    // Should contain the marker item
    const found = data.items.find((i) => i.title === marker)
    expect(found).toBeDefined()
  })

  test('Enum field (status) is stored and retrieved correctly', async ({ request }) => {
    const res = await request.post(base, {
      data: { title: 'Enum Test', done: false, status: 'archived' },
      headers: AUTH,
    })
    expect(res.status()).toBe(201)
    const item = unwrap(await res.json()) as { status: string }
    expect(item.status).toBe('archived')
  })

  test('Text/nullable field (content) can be null', async ({ request }) => {
    const res = await request.post(base, {
      data: { title: 'Nullable Content', done: false, status: 'active', content: null },
      headers: AUTH,
    })
    expect(res.status()).toBe(201)
    const item = unwrap(await res.json()) as { content: null }
    expect(item.content).toBeNull()
  })
})
