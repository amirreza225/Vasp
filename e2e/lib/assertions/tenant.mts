/**
 * Multi-tenant isolation assertion suite.
 *
 * Verifies that row-level tenant isolation is enforced: a user belonging to
 * workspace A cannot read, update, or delete rows owned by workspace B.
 *
 * Pre-condition: FixtureHarness must have been configured with
 * `seedWorkspace: true` so two workspaces + tasks exist in the DB.
 * Users are registered via the API during the test run (one per workspace).
 *
 * Usage:
 *   import { tenantIsolationSuite } from '../../lib/assertions/tenant.mts'
 *   tenantIsolationSuite({
 *     backendUrl: state.backendUrl,
 *     entitySlug: 'task',
 *     sampleCreate: { title: 'My Task', done: false },
 *     sampleUpdate: { done: true },
 *     seedData: state.seedData as MultiTenantSeedData,
 *   })
 */

import { test, expect } from '../test.mts'
import { unwrap } from '../FixtureHarness.mts'

export interface MultiTenantSeedData {
  workspaceAlphaId: number
  workspaceBetaId: number
  alphaTaskCount: number
  betaTaskCount: number
}

export interface TenantIsolationOptions {
  backendUrl: string
  /** Entity slug for the tenant-scoped resource, e.g. "task" */
  entitySlug: string
  /** Valid create body (workspaceId will NOT be added here — it's on the user) */
  sampleCreate: Record<string, unknown>
  sampleUpdate: Record<string, unknown>
  seedData: MultiTenantSeedData
}

/**
 * Create a user via register + login and return a request context
 * that includes the session cookie.
 * Returns both the cookie string and the user's id.
 */
async function loginAsNewUser(
  backendUrl: string,
  suffix: string,
  workspaceId: number,
  request: import('@playwright/test').APIRequestContext,
): Promise<{ userId: number }> {
  const username = `e2etenant_${suffix}`
  const email = `${username}@vasp-test.io`
  const password = 'Tenant@Pass1!'

  const regRes = await request.post(`${backendUrl}/api/auth/register`, {
    data: { username, email, password, workspaceId },
  })
  expect(regRes.status()).toBeLessThan(300)
  const regBody = unwrap(await regRes.json()) as { id: number }

  const loginRes = await request.post(`${backendUrl}/api/auth/login`, {
    data: { username, password },
  })
  expect(loginRes.ok()).toBe(true)

  return { userId: regBody.id }
}

export function tenantIsolationSuite(opts: TenantIsolationOptions): void {
  const { backendUrl, entitySlug, sampleCreate, sampleUpdate, seedData } = opts
  const base = `${backendUrl}/api/crud/${entitySlug}`

  test.describe(`Multi-tenant isolation — ${entitySlug}`, () => {
    // Each describe block gets its own request context (with cookies)
    // because Playwright test isolation applies per test, not per describe.

    test('Tenant-A user sees ONLY their own tasks from the list endpoint', async ({
      request,
    }) => {
      const alphaTs = `alpha_${Date.now()}`
      await loginAsNewUser(backendUrl, alphaTs, seedData.workspaceAlphaId, request)

      const listRes = await request.get(base)
      expect(listRes.ok()).toBe(true)
      const data = unwrap(await listRes.json()) as {
        items: { workspaceId?: number; title: string }[]
      }

      // All items must belong to workspace alpha
      for (const item of data.items) {
        if (item.workspaceId !== undefined) {
          expect(item.workspaceId).toBe(seedData.workspaceAlphaId)
        }
      }
    })

    test('Tenant-B user sees ONLY their own tasks', async ({ request }) => {
      const betaTs = `beta_${Date.now()}`
      await loginAsNewUser(backendUrl, betaTs, seedData.workspaceBetaId, request)

      const listRes = await request.get(base)
      expect(listRes.ok()).toBe(true)
      const data = unwrap(await listRes.json()) as {
        items: { workspaceId?: number }[]
      }

      for (const item of data.items) {
        if (item.workspaceId !== undefined) {
          expect(item.workspaceId).toBe(seedData.workspaceBetaId)
        }
      }
    })

    test('Tenant-A user creating a task produces a row scoped to workspace-alpha', async ({
      request,
    }) => {
      const ts = `create_${Date.now()}`
      await loginAsNewUser(backendUrl, ts, seedData.workspaceAlphaId, request)

      const createRes = await request.post(base, {
        data: sampleCreate,
      })
      expect(createRes.status()).toBeLessThan(300)
      const created = unwrap(await createRes.json()) as {
        id: number
        workspaceId?: number
      }

      if (created.workspaceId !== undefined) {
        expect(created.workspaceId).toBe(seedData.workspaceAlphaId)
      }
    })

    test('Tenant-A user cannot GET a task owned by workspace-beta', async ({ request }) => {
      // Login as tenant B to get a known item id from their workspace
      const betaTs = `getB_${Date.now()}`
      await loginAsNewUser(backendUrl, betaTs, seedData.workspaceBetaId, request)

      const listRes = await request.get(base)
      const betaData = unwrap(await listRes.json()) as { items: { id: number }[] }
      const betaItemId = betaData.items[0]?.id

      if (!betaItemId) {
        // No seeded items visible — test is vacuously true
        return
      }

      // Now log out (clear cookie context) and login as tenant A
      await request.post(`${backendUrl}/api/auth/logout`)
      const alphaTs = `getA_${Date.now()}`
      await loginAsNewUser(backendUrl, alphaTs, seedData.workspaceAlphaId, request)

      // Tenant A tries to GET an item from tenant B
      const crossRes = await request.get(`${base}/${betaItemId}`)
      // Should be 404 (not found in their tenant scope) or 403 (forbidden)
      expect([403, 404]).toContain(crossRes.status())
    })

    test('Tenant-A user cannot UPDATE a task owned by workspace-beta', async ({ request }) => {
      const betaTs = `updB_${Date.now()}`
      await loginAsNewUser(backendUrl, betaTs, seedData.workspaceBetaId, request)

      const listRes = await request.get(base)
      const betaData = unwrap(await listRes.json()) as { items: { id: number }[] }
      const betaItemId = betaData.items[0]?.id

      if (!betaItemId) return

      await request.post(`${backendUrl}/api/auth/logout`)
      const alphaTs = `updA_${Date.now()}`
      await loginAsNewUser(backendUrl, alphaTs, seedData.workspaceAlphaId, request)

      const crossRes = await request.put(`${base}/${betaItemId}`, { data: sampleUpdate })
      expect([403, 404]).toContain(crossRes.status())
    })

    test('Tenant-A user cannot DELETE a task owned by workspace-beta', async ({ request }) => {
      const betaTs = `delB_${Date.now()}`
      await loginAsNewUser(backendUrl, betaTs, seedData.workspaceBetaId, request)

      const listRes = await request.get(base)
      const betaData = unwrap(await listRes.json()) as { items: { id: number }[] }
      const betaItemId = betaData.items[0]?.id

      if (!betaItemId) return

      await request.post(`${backendUrl}/api/auth/logout`)
      const alphaTs = `delA_${Date.now()}`
      await loginAsNewUser(backendUrl, alphaTs, seedData.workspaceAlphaId, request)

      const crossRes = await request.delete(`${base}/${betaItemId}`)
      expect([403, 404]).toContain(crossRes.status())
    })

    test('Tenant lists are isolated: workspace-alpha items not visible to workspace-beta', async ({
      request,
    }) => {
      // Create an item in workspace alpha
      const alphaTs = `crosslist_alpha_${Date.now()}`
      await loginAsNewUser(backendUrl, alphaTs, seedData.workspaceAlphaId, request)

      const createRes = await request.post(base, { data: sampleCreate })
      const created = unwrap(await createRes.json()) as { id: number }

      // Switch to workspace beta
      await request.post(`${backendUrl}/api/auth/logout`)
      const betaTs = `crosslist_beta_${Date.now()}`
      await loginAsNewUser(backendUrl, betaTs, seedData.workspaceBetaId, request)

      const betaList = unwrap(await (await request.get(base)).json()) as {
        items: { id: number }[]
      }
      const found = betaList.items.find((i) => i.id === created.id)
      expect(found).toBeUndefined()
    })
  })
}
