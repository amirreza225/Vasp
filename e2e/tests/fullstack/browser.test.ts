/**
 * Browser tests — run Playwright against the real Vite dev server +
 * Elysia backend to verify the Vue SPA works end-to-end.
 *
 * Important: The e2e-todo fixture has auth enabled, so the Vue Router
 * redirects unauthenticated users from any protected route to /login.
 * Tests that need to visit protected pages use the login API first.
 *
 * Error handling strategy:
 *   - Ignore console.warn / deprecation messages (filtered out)
 *   - Ignore expected auth 401 messages (unauthenticated state is normal)
 *   - Fail on unexpected console.error messages
 *   - Fail on uncaught JS exceptions
 *   - Fail on any 5xx response from the backend
 */

import { test, expect, type Page } from '../../lib/test.mts'

const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://localhost:3001'
const MAGIC = process.env.E2E_MAGIC_TOKEN ?? ''

/** Returns true if the message should be ignored in console.error checks. */
function isIgnoredConsoleError(text: string): boolean {
  return (
    text.includes('deprecat') ||
    text.includes('DeprecationWarning') ||
    text.includes('[Vue warn]') ||
    // Auth 401 on page load is expected — user isn't logged in yet
    text.includes('401') ||
    text.includes('Unauthorized') ||
    text.includes('[auth]') ||
    text.includes('Authentication required')
  )
}

// ── App loading ───────────────────────────────────────────────────────────────

test.describe('App loading', () => {
  test('homepage loads without uncaught JS errors', async ({ page }) => {
    const jsErrors: string[] = []
    page.on('pageerror', (err) => jsErrors.push(err.message))

    await page.goto('/')
    // Wait for navigation to settle (may redirect to /login)
    await page.waitForLoadState('networkidle')

    expect(jsErrors).toHaveLength(0)
  })

  test('Vue app mounts and is not empty', async ({ page }) => {
    await page.goto('/')
    const app = page.locator('#app')
    await expect(app).toBeVisible()
    await expect(app).not.toBeEmpty()
  })

  test('no unexpected console.error messages on load', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !isIgnoredConsoleError(msg.text())) {
        errors.push(msg.text())
      }
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    expect(errors).toHaveLength(0)
  })

  test('no failed network requests for static assets', async ({ page }) => {
    const failedUrls: string[] = []
    page.on('requestfailed', (req) => failedUrls.push(req.url()))

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Filter out expected backend API calls (auth 401s are fine for unauthenticated state)
    const unexpected = failedUrls.filter((url) => !url.includes('/api/'))
    expect(unexpected).toHaveLength(0)
  })

  test('no 5xx responses from the backend during load', async ({ page }) => {
    const serverErrors: string[] = []
    page.on('response', (res) => {
      if (res.url().includes('/api/') && res.status() >= 500) {
        serverErrors.push(`${res.status()} ${res.url()}`)
      }
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    expect(serverErrors).toHaveLength(0)
  })
})

// ── Page title ────────────────────────────────────────────────────────────────

test('page title reflects the app title from the fixture', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/E2E Todo/i)
})

// ── Vue Router + auth redirect ────────────────────────────────────────────────

test.describe('Vue Router', () => {
  test('unauthenticated user visiting "/" is redirected to /login', async ({ page }) => {
    await page.goto('/')
    // The auth guard redirects unauthenticated users to /login — this is correct behavior
    await page.waitForURL('**/login', { timeout: 5_000 })
    expect(page.url()).toContain('/login')
  })

  test('/login route renders the Login form', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('form')).toBeVisible()
    await expect(page.locator('input[name="username"], input[placeholder*="sername" i]')).toBeVisible()
    await expect(page.locator('input[name="password"], input[placeholder*="assword" i]')).toBeVisible()
  })

  test('/register route renders the Register form', async ({ page }) => {
    await page.goto('/register')
    await expect(page.locator('form')).toBeVisible()
  })

  test('navigating to a missing route keeps the app mounted', async ({ page }) => {
    await page.goto('/this-path-does-not-exist')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('#app')).toBeAttached()
  })

  test('authenticated user visiting "/" sees the Home page', async ({ page, request }) => {
    // Register a test user via the API first
    const uniqueSuffix = `home-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const username = `e2ehome_${uniqueSuffix}`
    const password = 'E2ePassword123!'
    const email = `${username}@example.com`

    await request.post(`${BACKEND}/api/auth/register`, {
      data: { username, password, email },
    })

    // Login through the UI so the auth cookie gets set in the page context
    await page.goto('/login')
    await page.fill('input[name="username"], input[placeholder*="sername" i]', username)
    await page.fill('input[name="password"], input[placeholder*="assword" i]', password)
    await page.click('button[type="submit"]')

    // After login, the app should navigate to "/"
    await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 10_000 })

    // Home page should now render the stub component
    const h1 = page.locator('h1')
    await expect(h1).toHaveText('Home', { timeout: 5_000 })
  })
})

// ── Auth UI flow ──────────────────────────────────────────────────────────────

test.describe('Auth UI', () => {
  const uniqueSuffix = `ui-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const username = `e2eui_${uniqueSuffix}`
  const password = 'E2ePassword123!'
  const email = `${username}@example.com`

  test('register form submits successfully and redirects', async ({ page }) => {
    await page.goto('/register')

    await page.fill('input[name="username"], input[placeholder*="sername" i]', username)
    await page.fill('input[name="email"], input[placeholder*="mail" i]', email)
    await page.fill('input[name="password"], input[placeholder*="assword" i]', password)

    const jsErrors: string[] = []
    page.on('pageerror', (e) => jsErrors.push(e.message))

    await page.click('button[type="submit"]')

    await page.waitForURL((url) => !url.pathname.endsWith('/register'), { timeout: 10_000 })
    expect(jsErrors).toHaveLength(0)
  })

  test('login form with valid credentials redirects away from /login', async ({ page }) => {
    await page.goto('/login')

    await page.fill('input[name="username"], input[placeholder*="sername" i]', username)
    await page.fill('input[name="password"], input[placeholder*="assword" i]', password)

    const jsErrors: string[] = []
    page.on('pageerror', (e) => jsErrors.push(e.message))

    await page.click('button[type="submit"]')

    await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 10_000 })
    expect(jsErrors).toHaveLength(0)
  })
})
