/**
 * Browser smoke tests for the minimal fixture.
 *
 * The minimal fixture has a single route "/" → HomePage with no auth.
 * Verifies the SPA loads and the page renders without JS errors.
 */

import { test, expect } from '../../lib/test.mts'
import { readFixtureState } from '../../lib/FixtureHarness.mts'

const state = readFixtureState('minimal')
const FRONTEND = state.frontendUrl ?? 'http://localhost:5201'

test.describe('[minimal] Browser smoke tests', () => {
  test('frontend loads without JS errors', async ({ page }) => {
    const jsErrors: string[] = []
    page.on('pageerror', (e) => jsErrors.push(e.message))

    await page.goto(FRONTEND)
    await page.waitForLoadState('networkidle')

    expect(jsErrors).toHaveLength(0)
  })

  test('#app element is mounted in the DOM', async ({ page }) => {
    await page.goto(FRONTEND)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('#app')).toBeAttached()
  })

  test('page title contains "Minimal App"', async ({ page }) => {
    await page.goto(FRONTEND)
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveTitle(/Minimal App/i)
  })

  test('navigating to "/" does not 404', async ({ page }) => {
    const response = await page.goto(FRONTEND)
    expect(response?.status()).not.toBe(404)
  })

  test('unknown route keeps the app mounted (SPA fallback)', async ({ page }) => {
    await page.goto(`${FRONTEND}/this-path-does-not-exist`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('#app')).toBeAttached()
  })
})
