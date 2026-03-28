/**
 * Browser / UI tests for the e2e-todo suite.
 * Migrated from e2e/tests/fullstack/browser.test.ts and extended.
 *
 * Tests the Vue SPA routing, auth forms, and authenticated page access.
 */

import { test, expect } from '../../lib/test.mts'
import { readFixtureState } from '../../lib/FixtureHarness.mts'

const state = readFixtureState('e2e-todo')
const BACKEND = state.backendUrl
const FRONTEND = state.frontendUrl ?? 'http://localhost:5203'

// ── Page title ────────────────────────────────────────────────────────────────

test('[e2e-todo] page title reflects app title from fixture', async ({ page }) => {
  await page.goto(FRONTEND)
  await expect(page).toHaveTitle(/E2E Todo/i, { timeout: 10_000 })
})

// ── Vue Router + auth redirect ────────────────────────────────────────────────

test.describe('[e2e-todo] Vue Router', () => {
  test('unauthenticated user visiting "/" is redirected to /login', async ({ page }) => {
    await page.goto(FRONTEND)
    await page.waitForURL('**/login', { timeout: 8_000 })
    expect(page.url()).toContain('/login')
  })

  test('/login route renders the Login form', async ({ page }) => {
    await page.goto(`${FRONTEND}/login`)
    await expect(page.locator('form')).toBeVisible()
    await expect(page.locator('input[name="username"], input[placeholder*="sername" i]')).toBeVisible()
    await expect(page.locator('input[name="password"], input[placeholder*="assword" i]')).toBeVisible()
  })

  test('/register route renders the Register form', async ({ page }) => {
    await page.goto(`${FRONTEND}/register`)
    await expect(page.locator('form')).toBeVisible()
  })

  test('navigating to an unknown route keeps the app mounted', async ({ page }) => {
    await page.goto(`${FRONTEND}/this-path-does-not-exist`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('#app')).toBeAttached()
  })

  test('authenticated user visiting "/" sees the Home page', async ({ page, request }) => {
    const suffix = `router_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const username = `e2erouter_${suffix}`
    const password = 'E2eRouter123!'
    const email = `${username}@vasp-test.io`

    await request.post(`${BACKEND}/api/auth/register`, {
      data: { username, password, email },
    })

    await page.goto(`${FRONTEND}/login`)
    await page.fill('input[name="username"], input[placeholder*="sername" i]', username)
    await page.fill('input[name="password"], input[placeholder*="assword" i]', password)
    await page.click('button[type="submit"]')

    await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 12_000 })

    const h1 = page.locator('h1')
    await expect(h1).toBeVisible({ timeout: 8_000 })
  })
})

// ── Auth UI flow ──────────────────────────────────────────────────────────────

test.describe('[e2e-todo] Auth UI', () => {
  const suffix = `ui_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const username = `e2eui_${suffix}`
  const password = 'E2eUiPass123!'
  const email = `${username}@vasp-test.io`

  test('register form submits successfully and redirects away from /register', async ({
    page,
  }) => {
    await page.goto(`${FRONTEND}/register`)

    const jsErrors: string[] = []
    page.on('pageerror', (e) => jsErrors.push(e.message))

    await page.fill('input[name="username"], input[placeholder*="sername" i]', username)
    await page.fill('input[name="email"], input[placeholder*="mail" i]', email)
    await page.fill('input[name="password"], input[placeholder*="assword" i]', password)
    await page.click('button[type="submit"]')

    await page.waitForURL((url) => !url.pathname.endsWith('/register'), { timeout: 12_000 })
    expect(jsErrors).toHaveLength(0)
  })

  test('login form with valid credentials redirects away from /login', async ({ page }) => {
    await page.goto(`${FRONTEND}/login`)

    const jsErrors: string[] = []
    page.on('pageerror', (e) => jsErrors.push(e.message))

    await page.fill('input[name="username"], input[placeholder*="sername" i]', username)
    await page.fill('input[name="password"], input[placeholder*="assword" i]', password)
    await page.click('button[type="submit"]')

    await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 12_000 })
    expect(jsErrors).toHaveLength(0)
  })

  test('login form with wrong password shows an error (does not redirect)', async ({ page }) => {
    await page.goto(`${FRONTEND}/login`)

    await page.fill('input[name="username"], input[placeholder*="sername" i]', username)
    await page.fill('input[name="password"], input[placeholder*="assword" i]', 'WrongPass999!')
    await page.click('button[type="submit"]')

    // Page should stay on /login (no redirect)
    await page.waitForTimeout(3_000)
    expect(page.url()).toContain('/login')
  })
})

// ── No-JS-errors baseline ─────────────────────────────────────────────────────

test('[e2e-todo] /login page loads with zero JS errors', async ({ page }) => {
  const jsErrors: string[] = []
  page.on('pageerror', (e) => jsErrors.push(e.message))
  await page.goto(`${FRONTEND}/login`)
  await page.waitForLoadState('networkidle')
  expect(jsErrors).toHaveLength(0)
})
