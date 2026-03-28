import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['e2e/tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/tests/browser/**', 'e2e/tests/fullstack/**'],    // browser/ and fullstack/ are run by Playwright, not vitest
    testTimeout: 60_000, // e2e tests may spawn processes
  },
})
