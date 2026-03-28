/**
 * Auth assertion suite.
 *
 * Tests the full register → login → /me → logout flow plus common
 * error paths (duplicate username, wrong password, missing token).
 *
 * Usage:
 *   import { authSuite } from '../../lib/assertions/auth.mts'
 *   authSuite({ backendUrl: state.backendUrl })
 */

import { test, expect } from '../test.mts'
import { unwrap } from '../FixtureHarness.mts'

export interface AuthOptions {
  backendUrl: string
  /** Whether the auth fixture uses the "usernameAndPassword" provider (default true). */
  hasUsernameAndPassword?: boolean
  /**
   * Extra registration payload fields required by the entity (e.g., workspaceId for
   * multi-tenant fixtures). These are merged into every register request body.
   */
  extraRegisterFields?: Record<string, unknown>
}

export function authSuite(opts: AuthOptions): void {
  const { backendUrl } = opts
  const hasUP = opts.hasUsernameAndPassword !== false
  const extraFields = opts.extraRegisterFields ?? {}

  if (!hasUP) return

  test.describe('Auth — register + login flow', () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const username = `e2eauth_${suffix}`
    const password = 'E2eP@ssw0rd!'
    const email = `${username}@vasp-test.io`

    // ── Register ────────────────────────────────────────────────────────────

    test('POST /api/auth/register creates a user and returns 200', async ({ request }) => {
      const res = await request.post(`${backendUrl}/api/auth/register`, {
        data: { username, password, email, ...extraFields },
      })
      expect(res.ok()).toBe(true)
      const body = await res.json()
      const user = unwrap(body) as Record<string, unknown>
      expect(user).toHaveProperty('username', username)
      // Password hash must never be returned
      expect(user).not.toHaveProperty('passwordHash')
      expect(user).not.toHaveProperty('password')
    })

    test('POST /api/auth/register rejects duplicate username with 400 or 409', async ({
      request,
    }) => {
      const res = await request.post(`${backendUrl}/api/auth/register`, {
        data: { username, password, email: `other_${email}`, ...extraFields },
      })
      expect([400, 409]).toContain(res.status())
    })

    test('POST /api/auth/register rejects missing password with 400', async ({ request }) => {
      const res = await request.post(`${backendUrl}/api/auth/register`, {
        data: { username: `nopwd_${suffix}`, email: `nopwd_${email}`, ...extraFields },
      })
      expect(res.status()).toBe(400)
    })

    // ── Login ───────────────────────────────────────────────────────────────

    test('POST /api/auth/login with valid credentials returns 200', async ({ request }) => {
      const res = await request.post(`${backendUrl}/api/auth/login`, {
        data: { username, password },
      })
      expect(res.ok()).toBe(true)
      const body = await res.json()
      const user = unwrap(body) as Record<string, unknown>
      expect(user).toHaveProperty('username', username)
      expect(user).not.toHaveProperty('passwordHash')
    })

    test('POST /api/auth/login with wrong password returns 401', async ({ request }) => {
      const res = await request.post(`${backendUrl}/api/auth/login`, {
        data: { username, password: 'WrongPassword999!' },
      })
      expect(res.status()).toBe(401)
    })

    test('POST /api/auth/login with unknown username returns 401', async ({ request }) => {
      const res = await request.post(`${backendUrl}/api/auth/login`, {
        data: { username: 'nobody_xyzzy_vasp_e2e', password },
      })
      expect(res.status()).toBe(401)
    })

    // ── /me ─────────────────────────────────────────────────────────────────

    test('GET /api/auth/me without a token returns 401', async ({ request }) => {
      const res = await request.get(`${backendUrl}/api/auth/me`)
      expect(res.status()).toBe(401)
    })

    test('GET /api/auth/me with a valid session cookie returns 200', async ({ request }) => {
      // Register fresh user for this test to avoid cookie-sharing issues
      const localSuffix = `me_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      const localUser = `e2eme_${localSuffix}`
      const localEmail = `${localUser}@vasp-test.io`

      await request.post(`${backendUrl}/api/auth/register`, {
        data: { username: localUser, password, email: localEmail, ...extraFields },
      })

      const loginRes = await request.post(`${backendUrl}/api/auth/login`, {
        data: { username: localUser, password },
      })
      expect(loginRes.ok()).toBe(true)

      // The auth cookie is stored in the request context automatically
      const meRes = await request.get(`${backendUrl}/api/auth/me`)
      expect(meRes.ok()).toBe(true)
      const meBody = await meRes.json()
      const me = unwrap(meBody) as Record<string, unknown>
      expect(me).toHaveProperty('username', localUser)
    })

    // ── Logout ──────────────────────────────────────────────────────────────

    test('POST /api/auth/logout returns 200', async ({ request }) => {
      const res = await request.post(`${backendUrl}/api/auth/logout`)
      expect(res.ok()).toBe(true)
    })
  })
}
