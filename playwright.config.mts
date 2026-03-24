import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

// The app is scaffolded into this directory by global-setup.ts
const __dirname = fileURLToPath(new URL('.', import.meta.url))
const APP_DIR = join(__dirname, 'e2e', '__pw_app__')

export default defineConfig({
  testDir: './e2e/tests/browser',
  globalSetup: './e2e/setup/global-setup.mts',
  globalTeardown: './e2e/setup/global-teardown.mts',

  use: {
    baseURL: 'http://localhost:4173',
    // Capture traces on first retry to ease debugging CI failures
    trace: 'on-first-retry',
  },

  // Vite preview serves the pre-built dist/ from APP_DIR
  webServer: {
    command: 'bunx vite preview --port 4173',
    cwd: APP_DIR,
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
