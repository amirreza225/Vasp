import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for the fullstack E2E suite.
 *
 * Runs against a real Elysia backend + Vite dev server spun up by
 * e2e/setup/fullstack-setup.mts using a Docker Postgres database.
 *
 * Run with:
 *   bun run test:e2e:fullstack
 */
export default defineConfig({
  testDir: './e2e/tests/fullstack',
  globalSetup: './e2e/setup/fullstack-setup.mts',
  globalTeardown: './e2e/setup/fullstack-teardown.mts',

  // Individual test timeout — real DB queries + network are involved
  timeout: 30_000,

  // Retry once on failure to distinguish flaky tests from real bugs
  retries: 1,

  use: {
    // Vite dev server URL
    baseURL: 'http://localhost:5173',
    // Capture a trace on the first retry to make debugging easier
    trace: 'on-first-retry',
    // Screenshot only on failure to keep artifacts small
    screenshot: 'only-on-failure',
    // Ignore deprecation warnings logged to the console
    // (these are filtered in individual tests instead)
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  // Write the Playwright HTML report to a separate dir from the static browser tests
  reporter: [
    ['html', { outputFolder: 'playwright-report-fullstack', open: 'never' }],
    ['list'],
  ],
})
