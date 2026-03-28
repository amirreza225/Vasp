/**
 * Auth tests for the full-featured suite.
 *
 * TS SSR app with usernameAndPassword + google + github auth.
 * Only usernameAndPassword is tested in E2E (OAuth providers need real credentials).
 */

import { readFixtureState } from '../../lib/FixtureHarness.mts'
import { authSuite } from '../../lib/assertions/auth.mts'
import { test, expect } from '@playwright/test'

const state = readFixtureState('full-featured')
const BACKEND = state.backendUrl

authSuite({ backendUrl: BACKEND, hasUsernameAndPassword: true })

// ── OAuth endpoints are mounted (generation-level) ────────────────────────────

test.describe('[full-featured] OAuth endpoints mounted', () => {
  test('GET /api/auth/google redirects (not 404)', async ({ request }) => {
    const res = await request.get(`${BACKEND}/api/auth/google`, { maxRedirects: 0 })
    // Should be 302 (redirect to OAuth provider) or 400/500 (stub credentials)
    expect(res.status()).not.toBe(404)
  })

  test('GET /api/auth/github redirects (not 404)', async ({ request }) => {
    const res = await request.get(`${BACKEND}/api/auth/github`, { maxRedirects: 0 })
    expect(res.status()).not.toBe(404)
  })
})
