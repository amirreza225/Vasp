/**
 * Playwright config for the project-hub fixture suite.
 * Full infra: Redis + RabbitMQ + Kafka + MinIO + Mailpit.
 * Run with: bun run test:e2e:project-hub
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/suites/project-hub',
  globalSetup: './e2e/suites/project-hub/setup.mts',
  globalTeardown: './e2e/suites/project-hub/teardown.mts',
  // Extended timeout for complex fixture with many external services
  timeout: 60_000,
  retries: 1,
  workers: 2,
  use: {
    baseURL: 'http://localhost:5206',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  reporter: [
    ['html', { outputFolder: 'playwright-report-project-hub', open: 'never' }],
    ['list'],
  ],
})
