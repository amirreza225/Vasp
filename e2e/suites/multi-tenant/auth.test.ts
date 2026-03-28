/**
 * Auth tests for the multi-tenant suite.
 *
 * Users must be registered with a workspaceId. The harness seeds two
 * workspaces (alpha + beta) via direct DB insert before the backend starts.
 */

import { test, expect } from '../../lib/test.mts'
import { readFixtureState, unwrap } from '../../lib/FixtureHarness.mts'

const state = readFixtureState('multi-tenant')
const BACKEND = state.backendUrl
const seed = state.seedData as { workspaceAlphaId: number; workspaceBetaId: number }

test.describe('[multi-tenant] Auth', () => {
  const suffix = `auth_${Date.now()}`
  const username = `e2emt_${suffix}`
  const password = 'MultiTenant@Pass1!'
  const email = `${username}@vasp-test.io`

  test('POST /api/auth/register with workspaceId succeeds', async ({ request }) => {
    const res = await request.post(`${BACKEND}/api/auth/register`, {
      data: {
        username,
        password,
        email,
        workspaceId: seed.workspaceAlphaId,
      },
    })
    expect(res.ok()).toBe(true)
    const user = unwrap(await res.json()) as Record<string, unknown>
    expect(user).toHaveProperty('username', username)
    expect(user).not.toHaveProperty('passwordHash')
  })

  test('POST /api/auth/login returns 200 for registered user', async ({ request }) => {
    const res = await request.post(`${BACKEND}/api/auth/login`, {
      data: { username, password },
    })
    expect(res.ok()).toBe(true)
  })

  test('POST /api/auth/login with wrong password returns 401', async ({ request }) => {
    const res = await request.post(`${BACKEND}/api/auth/login`, {
      data: { username, password: 'wrong-pass-123' },
    })
    expect(res.status()).toBe(401)
  })

  test('GET /api/auth/me without session returns 401', async ({ request }) => {
    const res = await request.get(`${BACKEND}/api/auth/me`)
    expect(res.status()).toBe(401)
  })

  test('GET /api/auth/me after login returns the correct user', async ({ request }) => {
    const meSuffix = `me_mt_${Date.now()}`
    const meUser = `e2eme_${meSuffix}`
    await request.post(`${BACKEND}/api/auth/register`, {
      data: {
        username: meUser,
        password,
        email: `${meUser}@vasp-test.io`,
        workspaceId: seed.workspaceAlphaId,
      },
    })
    await request.post(`${BACKEND}/api/auth/login`, {
      data: { username: meUser, password },
    })
    const meRes = await request.get(`${BACKEND}/api/auth/me`)
    expect(meRes.ok()).toBe(true)
    const me = unwrap(await meRes.json()) as Record<string, unknown>
    expect(me).toHaveProperty('username', meUser)
  })

  test('POST /api/auth/logout returns 200', async ({ request }) => {
    const res = await request.post(`${BACKEND}/api/auth/logout`)
    expect(res.ok()).toBe(true)
  })
})
