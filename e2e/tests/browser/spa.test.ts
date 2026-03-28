import { test, expect } from '../../lib/test.mts'

/**
 * Browser tests for a Vasp-generated minimal SPA app.
 *
 * The app is scaffolded, built, and served by global-setup / playwright.config.ts.
 * It is a SPA + JavaScript app with a single "/" route pointing to a "Home" page
 * whose stub component renders <h1>Home</h1>.
 */

test.describe('Vasp generated SPA', () => {
  // ---------------------------------------------------------------------------
  // Loading & mounting
  // ---------------------------------------------------------------------------
  test('homepage loads without errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto('/')
    // Vue app mounts into #app
    await expect(page.locator('#app')).toBeVisible()
    // No uncaught JS errors on load
    expect(errors).toHaveLength(0)
  })

  test('Vue app is mounted (not empty)', async ({ page }) => {
    await page.goto('/')
    // #app should have child elements after Vue mounts — not an empty div
    const app = page.locator('#app')
    await expect(app).not.toBeEmpty()
  })

  // ---------------------------------------------------------------------------
  // Page title
  // ---------------------------------------------------------------------------
  test('page title matches app title from main.vasp', async ({ page }) => {
    await page.goto('/')
    // toPascal('__pw_app__') → PwApp, toTitle → generates title "Pw App"
    await expect(page).toHaveTitle(/Pw App/i)
  })

  // ---------------------------------------------------------------------------
  // Vue Router — home route
  // ---------------------------------------------------------------------------
  test('root route "/" renders the Home page stub', async ({ page }) => {
    await page.goto('/')
    // FrontendGenerator scaffolds <h1>Home</h1> as the stub page content
    await expect(page.locator('h1')).toHaveText('Home')
  })

  test('stub page has edit hint text', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Edit this page in src/pages/')).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // Vue Router — navigation behaviour
  // ---------------------------------------------------------------------------
  test('navigating to a missing route keeps the app mounted', async ({ page }) => {
    await page.goto('/this-route-does-not-exist')
    // Vue Router may render nothing for unknown routes but the app container
    // must still be in the DOM (attached), proving the SPA didn't crash.
    await expect(page.locator('#app')).toBeAttached()
  })

  test('deep-linking to "/" works the same as a fresh load', async ({ page }) => {
    await page.goto('/') // first navigation
    await page.reload()   // simulates deep-link
    await expect(page.locator('h1')).toHaveText('Home')
  })

  // ---------------------------------------------------------------------------
  // Static assets & network
  // ---------------------------------------------------------------------------
  test('no failed network requests for core assets', async ({ page }) => {
    const failedUrls: string[] = []
    page.on('requestfailed', (req) => failedUrls.push(req.url()))

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Filter out expected backend requests (API is not running in static preview)
    const unexpected = failedUrls.filter((url) => !url.includes('/api/'))
    expect(unexpected).toHaveLength(0)
  })
})
