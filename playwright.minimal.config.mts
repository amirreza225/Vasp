/**
 * Playwright config for the minimal fixture suite.
 * Run with: bun run test:e2e:minimal
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/suites/minimal',
  globalSetup: './e2e/suites/minimal/setup.mts',
  globalTeardown: './e2e/suites/minimal/teardown.mts',
  timeout: 30_000,
  retries: 1,
  workers: 2,
  use: {
    baseURL: 'http://localhost:5201',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  reporter: [
    ['html', { outputFolder: 'playwright-report-minimal', open: 'never' }],
    ['list'],
  ],
})
