/**
 * Playwright config for the multi-tenant fixture suite.
 * Run with: bun run test:e2e:multi-tenant
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/suites/multi-tenant',
  globalSetup: './e2e/suites/multi-tenant/setup.mts',
  globalTeardown: './e2e/suites/multi-tenant/teardown.mts',
  timeout: 30_000,
  retries: 1,
  workers: 2,
  use: {
    baseURL: 'http://localhost:5204',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  reporter: [
    ['html', { outputFolder: 'playwright-report-multi-tenant', open: 'never' }],
    ['list'],
  ],
})
