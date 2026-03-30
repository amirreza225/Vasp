import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

const rootDir = new URL('.', import.meta.url).pathname

export default defineConfig({
  resolve: {
    alias: {
      '@vasp-framework/core': resolve(rootDir, 'packages/core/src/index.ts'),
      '@vasp-framework/parser': resolve(rootDir, 'packages/parser/src/index.ts'),
      '@vasp-framework/generator': resolve(rootDir, 'packages/generator/src/index.ts'),
      '@vasp-framework/runtime': resolve(rootDir, 'packages/runtime/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['packages/*/src/**/*.test.ts', 'packages/*/tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts'],
    },
    // Slow integration tests must be tagged with @slow and run separately
    // Run with: vitest --reporter=verbose
  },
})
