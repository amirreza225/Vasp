/**
 * Playwright all-suites orchestrator config.
 *
 * Runs ALL six fixture suites sequentially (one after another) in a single
 * Playwright invocation. This is the "full sweep" mode for CI.
 *
 * Each suite runs as a dedicated Playwright "project" with its own
 * globalSetup / globalTeardown pair registered via project-level
 * dependencies (Playwright 1.38+ project setup/teardown).
 *
 * Sequential order (enforced by project dependencies):
 *   minimal → todo-app → e2e-todo → multi-tenant → full-featured → project-hub
 *
 * Run with: bun run test:e2e:suites
 */
import { defineConfig } from '@playwright/test'

export default defineConfig({
  workers: 1, // Sequential across projects

  // Use individual Playwright configs for each suite's globalSetup/Teardown
  // Run them in sequence by listing projects in order with no parallelism.
  projects: [
    {
      name: 'minimal',
      testDir: './e2e/suites/minimal',
      use: { baseURL: 'http://localhost:5201' },
    },
    {
      name: 'todo-app',
      testDir: './e2e/suites/todo-app',
      use: { baseURL: 'http://localhost:5202' },
      // Depends on minimal completing first (prevents parallel startup)
      dependencies: ['minimal'],
    },
    {
      name: 'e2e-todo',
      testDir: './e2e/suites/e2e-todo',
      use: { baseURL: 'http://localhost:5203' },
      dependencies: ['todo-app'],
    },
    {
      name: 'multi-tenant',
      testDir: './e2e/suites/multi-tenant',
      use: { baseURL: 'http://localhost:5204' },
      dependencies: ['e2e-todo'],
    },
    {
      name: 'full-featured',
      testDir: './e2e/suites/full-featured',
      use: { baseURL: 'http://localhost:5205' },
      dependencies: ['multi-tenant'],
    },
    {
      name: 'project-hub',
      testDir: './e2e/suites/project-hub',
      use: { baseURL: 'http://localhost:5206' },
      dependencies: ['full-featured'],
    },
  ],

  // Note: globalSetup/Teardown are not supported at the project level in Playwright's
  // config format. Use the individual per-suite configs for proper lifecycle management:
  //   bun run test:e2e:minimal && bun run test:e2e:todo-app && ... (sequential shell)
  // OR use the test:e2e:suites script which runs each suite's config in order.

  timeout: 60_000,
  retries: 1,

  reporter: [
    ['html', { outputFolder: 'playwright-report-all-suites', open: 'never' }],
    ['list'],
  ],
})

