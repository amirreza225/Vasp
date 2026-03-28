/**
 * Playwright config for the e2e-todo fixture suite.
 * Migrated from playwright.fullstack.config.mts (original kept for backward compat).
 * Run with: bun run test:e2e:e2e-todo
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/suites/e2e-todo',
  globalSetup: './e2e/suites/e2e-todo/setup.mts',
  globalTeardown: './e2e/suites/e2e-todo/teardown.mts',
  timeout: 30_000,
  retries: 1,
  workers: 2,
  use: {
    baseURL: 'http://localhost:5203',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  reporter: [
    ['html', { outputFolder: 'playwright-report-e2e-todo', open: 'never' }],
    ['list'],
  ],
})
