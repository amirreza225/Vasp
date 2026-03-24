import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/tests/browser',
  globalSetup: './e2e/setup/global-setup.mts',
  globalTeardown: './e2e/setup/global-teardown.mts',

  use: {
    baseURL: 'http://localhost:4173',
    // Capture traces on first retry to ease debugging CI failures
    trace: 'on-first-retry',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
