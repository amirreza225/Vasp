/**
 * Auth tests for the project-hub suite.
 *
 * ProjectHub has roles (admin, manager, member, viewer) and permissions.
 * Users must be registered with a workspaceId (multi-tenant).
 */

import { test, expect } from '@playwright/test'
import { readFixtureState, unwrap } from '../../lib/FixtureHarness.mts'

const state = readFixtureState('project-hub')
const BACKEND = state.backendUrl
const seed = state.seedData as { workspaceAlphaId: number }

test.describe('[project-hub] Auth', () => {
  const suffix = `auth_${Date.now()}`
  const username = `e2eph_${suffix}`
  const password = 'ProjectHub@Pass1!'
  const email = `${username}@vasp-test.io`

  test('POST /api/auth/register with workspaceId succeeds', async ({ request }) => {
    const res = await request.post(`${BACKEND}/api/auth/register`, {
      data: {
        username,
        password,
        email,
        workspaceId: seed.workspaceAlphaId,
        displayName: 'E2E Test User',
        isActive: true,
      },
    })
    expect(res.ok()).toBe(true)
    const user = unwrap(await res.json()) as Record<string, unknown>
    expect(user).toHaveProperty('username', username)
    expect(user).not.toHaveProperty('passwordHash')
  })

  test('POST /api/auth/register duplicate username returns 400 or 409', async ({ request }) => {
    const res = await request.post(`${BACKEND}/api/auth/register`, {
      data: {
        username,
        password,
        email: `other_${email}`,
        workspaceId: seed.workspaceAlphaId,
        isActive: true,
      },
    })
    expect([400, 409]).toContain(res.status())
  })

  test('POST /api/auth/login returns 200 for registered user', async ({ request }) => {
    const res = await request.post(`${BACKEND}/api/auth/login`, {
      data: { username, password },
    })
    expect(res.ok()).toBe(true)
    const user = unwrap(await res.json()) as { role?: string }
    // Role field should be present (default: member)
    if (user.role !== undefined) {
      expect(['admin', 'manager', 'member', 'viewer']).toContain(user.role)
    }
  })

  test('GET /api/auth/me returns user with expected fields', async ({ request }) => {
    const meSuffix = `me_${Date.now()}`
    const meUser = `e2ephmе_${meSuffix}`
    await request.post(`${BACKEND}/api/auth/register`, {
      data: {
        username: meUser,
        password,
        email: `${meUser}@vasp-test.io`,
        workspaceId: seed.workspaceAlphaId,
        isActive: true,
      },
    })
    await request.post(`${BACKEND}/api/auth/login`, {
      data: { username: meUser, password },
    })
    const meRes = await request.get(`${BACKEND}/api/auth/me`)
    expect(meRes.ok()).toBe(true)
    const me = unwrap(await meRes.json()) as Record<string, unknown>
    expect(me).toHaveProperty('username', meUser)
    expect(me).not.toHaveProperty('passwordHash')
  })

  test('POST /api/auth/logout returns 200', async ({ request }) => {
    const res = await request.post(`${BACKEND}/api/auth/logout`)
    expect(res.ok()).toBe(true)
  })

  // ── OAuth endpoints (mounted, but no real credentials) ──────────────────

  test('GET /api/auth/google does not 404', async ({ request }) => {
    const res = await request.get(`${BACKEND}/api/auth/google`, { maxRedirects: 0 })
    expect(res.status()).not.toBe(404)
  })

  test('GET /api/auth/github does not 404', async ({ request }) => {
    const res = await request.get(`${BACKEND}/api/auth/github`, { maxRedirects: 0 })
    expect(res.status()).not.toBe(404)
  })
})
