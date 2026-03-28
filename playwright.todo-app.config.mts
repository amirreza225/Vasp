/**
 * Playwright config for the todo-app fixture suite.
 * Run with: bun run test:e2e:todo-app
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/suites/todo-app',
  globalSetup: './e2e/suites/todo-app/setup.mts',
  globalTeardown: './e2e/suites/todo-app/teardown.mts',
  timeout: 30_000,
  retries: 1,
  workers: 2,
  use: {
    baseURL: 'http://localhost:5202',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  reporter: [
    ['html', { outputFolder: 'playwright-report-todo-app', open: 'never' }],
    ['list'],
  ],
})
