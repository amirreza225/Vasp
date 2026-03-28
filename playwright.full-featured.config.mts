/**
 * Playwright config for the full-featured fixture suite.
 * SSR (Nuxt 4) + Redis + RabbitMQ + Kafka.
 * Run with: bun run test:e2e:full-featured
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/suites/full-featured',
  globalSetup: './e2e/suites/full-featured/setup.mts',
  globalTeardown: './e2e/suites/full-featured/teardown.mts',
  // SSR + multiple services need more time
  timeout: 60_000,
  retries: 1,
  workers: 2,
  use: {
    baseURL: 'http://localhost:5205',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  reporter: [
    ['html', { outputFolder: 'playwright-report-full-featured', open: 'never' }],
    ['list'],
  ],
})
