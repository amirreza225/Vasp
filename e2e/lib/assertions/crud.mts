/**
 * CRUD assertion suite.
 *
 * Exercises the full list / create / get / update / delete / 404 cycle
 * for a given entity via the generated `/api/crud/{entity}` REST endpoints.
 *
 * Supports both auth-gated (magic token) and public (no-auth) CRUD routes.
 *
 * Usage:
 *   import { crudSuite } from '../../lib/assertions/crud.mts'
 *   crudSuite({
 *     backendUrl: state.backendUrl,
 *     entitySlug: 'todo',        // endpoint: /api/crud/todo
 *     sampleCreate: { title: 'My Todo', done: false },
 *     sampleUpdate: { done: true },
 *     magicToken: state.magicToken,  // omit for no-auth fixtures
 *   })
 */

import { test, expect } from '@playwright/test'
import { unwrap } from '../FixtureHarness.mts'

export interface CrudSuiteOptions {
  backendUrl: string
  /** Entity slug used in the URL, e.g. "todo" → /api/crud/todo */
  entitySlug: string
  /** Body for POST /api/crud/{entity} */
  sampleCreate: Record<string, unknown>
  /** Partial body for PUT /api/crud/{entity}/:id */
  sampleUpdate: Record<string, unknown>
  /** If provided, Authorization: Bearer <token> header is sent on every request. */
  magicToken?: string
  /** Whether the endpoint requires auth (default: !!magicToken). */
  needsAuth?: boolean
  /**
   * Optional field to assert in the created response body.
   * Defaults to the first key of sampleCreate.
   */
  assertCreatedField?: string
  assertCreatedValue?: unknown
}

export function crudSuite(opts: CrudSuiteOptions): void {
  const { backendUrl, entitySlug, sampleCreate, sampleUpdate, magicToken } = opts
  const base = `${backendUrl}/api/crud/${entitySlug}`
  const needsAuth = opts.needsAuth ?? !!magicToken
  const authHeader = magicToken ? { Authorization: `Bearer ${magicToken}` } : {}
  const assertField =
    opts.assertCreatedField ?? (Object.keys(sampleCreate)[0] ?? 'id')
  const assertValue = opts.assertCreatedValue ?? sampleCreate[assertField]

  test.describe(`CRUD — ${entitySlug}`, () => {
    // ── Auth guard check ────────────────────────────────────────────────────

    if (needsAuth) {
      test('GET /api/crud/{entity} without auth returns 401', async ({ request }) => {
        const res = await request.get(base)
        expect(res.status()).toBe(401)
      })

      test('magic token bypass: Authorization: Bearer <token> is accepted', async ({
        request,
      }) => {
        const res = await request.get(base, { headers: authHeader })
        expect(res.ok()).toBe(true)
      })

      test('wrong token on auth-required route returns 401', async ({ request }) => {
        const res = await request.get(base, {
          headers: { Authorization: 'Bearer wrong-token-vasp-e2e' },
        })
        expect(res.status()).toBe(401)
      })
    }

    // ── List ────────────────────────────────────────────────────────────────

    test('GET /api/crud/{entity} returns 200 with { items, total } shape', async ({ request }) => {
      const res = await request.get(base, { headers: authHeader })
      expect(res.ok()).toBe(true)
      const body = await res.json()
      const data = unwrap(body) as Record<string, unknown>
      expect(Array.isArray(data.items)).toBe(true)
      expect(typeof data.total).toBe('number')
    })

    test('GET /api/crud/{entity} has limit and offset in response', async ({ request }) => {
      const res = await request.get(base, { headers: authHeader })
      const body = await res.json()
      const data = unwrap(body) as Record<string, unknown>
      expect(typeof data.limit).toBe('number')
      expect(typeof data.offset).toBe('number')
    })

    test('GET /api/crud/{entity}?limit=1 respects limit', async ({ request }) => {
      // First create one item to ensure at least one exists
      await request.post(base, { data: sampleCreate, headers: authHeader })

      const res = await request.get(`${base}?limit=1`, { headers: authHeader })
      expect(res.ok()).toBe(true)
      const data = unwrap(await res.json()) as { items: unknown[] }
      expect(data.items.length).toBeLessThanOrEqual(1)
    })

    // ── Create ──────────────────────────────────────────────────────────────

    test('POST /api/crud/{entity} creates an item and returns 201', async ({ request }) => {
      const res = await request.post(base, {
        data: sampleCreate,
        headers: authHeader,
      })
      expect(res.status()).toBe(201)
      const body = await res.json()
      const item = unwrap(body) as Record<string, unknown>
      expect(item).toHaveProperty('id')
      if (assertValue !== undefined) {
        expect(item[assertField]).toEqual(assertValue)
      }
    })

    test('POST /api/crud/{entity} created item appears in list', async ({ request }) => {
      const createRes = await request.post(base, {
        data: { ...sampleCreate, _marker: `find_me_${Date.now()}` },
        headers: authHeader,
      })
      // 201 or 200 both acceptable
      expect(createRes.status()).toBeLessThan(300)
      const created = unwrap(await createRes.json()) as { id: number }

      const listRes = await request.get(base, { headers: authHeader })
      const listData = unwrap(await listRes.json()) as { items: { id: number }[] }
      const found = listData.items.find((i) => i.id === created.id)
      expect(found).toBeDefined()
    })

    // ── Get by id ───────────────────────────────────────────────────────────

    test('GET /api/crud/{entity}/:id returns the item', async ({ request }) => {
      const createRes = await request.post(base, {
        data: sampleCreate,
        headers: authHeader,
      })
      const created = unwrap(await createRes.json()) as { id: number }

      const getRes = await request.get(`${base}/${created.id}`, { headers: authHeader })
      expect(getRes.ok()).toBe(true)
      const item = unwrap(await getRes.json()) as { id: number }
      expect(item.id).toBe(created.id)
    })

    test('GET /api/crud/{entity}/:id for non-existent id returns 404', async ({ request }) => {
      const res = await request.get(`${base}/9999999`, { headers: authHeader })
      expect(res.status()).toBe(404)
    })

    // ── Update ──────────────────────────────────────────────────────────────

    test('PUT /api/crud/{entity}/:id updates the item', async ({ request }) => {
      const createRes = await request.post(base, {
        data: sampleCreate,
        headers: authHeader,
      })
      const created = unwrap(await createRes.json()) as { id: number }

      const updateRes = await request.put(`${base}/${created.id}`, {
        data: sampleUpdate,
        headers: authHeader,
      })
      expect(updateRes.ok()).toBe(true)
      const updated = unwrap(await updateRes.json()) as Record<string, unknown>

      // Verify at least one of the updated fields was changed
      const firstKey = Object.keys(sampleUpdate)[0]
      if (firstKey) {
        expect(updated[firstKey]).toEqual(sampleUpdate[firstKey])
      }
    })

    test('PUT /api/crud/{entity}/:id for non-existent id returns 404', async ({ request }) => {
      const res = await request.put(`${base}/9999999`, {
        data: sampleUpdate,
        headers: authHeader,
      })
      expect(res.status()).toBe(404)
    })

    // ── Delete ──────────────────────────────────────────────────────────────

    test('DELETE /api/crud/{entity}/:id removes the item', async ({ request }) => {
      const createRes = await request.post(base, {
        data: sampleCreate,
        headers: authHeader,
      })
      const created = unwrap(await createRes.json()) as { id: number }

      const delRes = await request.delete(`${base}/${created.id}`, { headers: authHeader })
      expect(delRes.ok()).toBe(true)

      // Item should no longer be accessible
      const getRes = await request.get(`${base}/${created.id}`, { headers: authHeader })
      expect(getRes.status()).toBe(404)
    })

    test('DELETE /api/crud/{entity}/:id for non-existent id returns 404', async ({ request }) => {
      const res = await request.delete(`${base}/9999999`, { headers: authHeader })
      expect(res.status()).toBe(404)
    })
  })
}
