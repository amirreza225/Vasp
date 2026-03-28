/**
 * Shared extended Playwright test instance for all Vasp E2E suites.
 *
 * Wraps Playwright's base `test` with two automatic behaviours:
 *
 *   1. **Browser console capture** — overrides the `page` fixture to attach a
 *      `console` / `pageerror` listener on every test that opens a browser page.
 *      All messages are collected and attached to the Playwright report as
 *      "browser-console" (text/plain) at the end of each test, making
 *      Vue Router warnings, JS errors, and network failures visible in the
 *      HTML report without having to open a trace zip.
 *
 *   2. **Server log attachment** — adds an auto-use `_serverLogs` fixture that,
 *      when a test FAILS, reads the last 500 lines of `backend.log` and
 *      `frontend.log` from the fixture's log directory and attaches them to the
 *      Playwright report.  The log directory is discovered at runtime from the
 *      fixture state JSON file (whose path is set as an env var by FixtureHarness).
 *
 * Usage — replace `@playwright/test` imports in all e2e files:
 *
 *   // Before:
 *   import { test, expect } from '@playwright/test'
 *
 *   // After (adjust relative path as needed):
 *   import { test, expect } from '../lib/test.mts'
 *
 * Every type exported by `@playwright/test` is re-exported so callers never
 * need two separate import lines.
 */

import { test as base, expect, type Page } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FixtureState } from './types.mts'

export { expect }
export type { Page, Request, Response, Route, BrowserContext, Locator } from '@playwright/test'

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Scan env vars set by FixtureHarness.setup() to find the log directory for
 * whatever fixture suite is currently running.
 *
 * FixtureHarness sets `E2E_<NAME>_STATE_FILE` for each active suite.  Because
 * each Playwright invocation runs a single suite, at most one state file will
 * be present and valid on disk.
 */
function findLogDir(): string | null {
  for (const [key, val] of Object.entries(process.env)) {
    if (!key.startsWith('E2E_') || !key.endsWith('_STATE_FILE') || !val) continue
    try {
      if (!existsSync(val)) continue
      const state = JSON.parse(readFileSync(val, 'utf8')) as FixtureState
      if (state.logDir && existsSync(state.logDir)) return state.logDir
    } catch {
      // Malformed or stale state file — skip
    }
  }
  return null
}

/** Read the last `maxLines` lines of a file, or the whole file if shorter. */
function tailFile(filePath: string, maxLines = 500): string {
  const content = readFileSync(filePath, 'utf8')
  const lines = content.split('\n')
  return lines.length > maxLines ? lines.slice(-maxLines).join('\n') : content
}

// ── Extended test object ──────────────────────────────────────────────────────

/**
 * Step 1 — override `page` to capture browser console messages and page errors.
 *
 * The override only activates for tests that actually open a browser page; API-
 * only tests that use `request` (but never `page`) are unaffected because
 * Playwright never instantiates the `page` fixture for them.
 */
const withConsoleLogs = base.extend<{ page: Page }>({
  page: async ({ page }, use, testInfo) => {
    const messages: string[] = []

    page.on('console', (msg) => {
      // Include the message type so warnings/errors are distinguishable from info
      messages.push(`[${msg.type().toUpperCase()}] ${msg.text()}`)
    })

    page.on('pageerror', (err) => {
      messages.push(`[PAGEERROR] ${err.message}`)
      if (err.stack) messages.push(err.stack)
    })

    await use(page)

    // Always attach — even passing tests may have interesting console output
    if (messages.length > 0) {
      await testInfo.attach('browser-console', {
        body: messages.join('\n'),
        contentType: 'text/plain',
      })
    }
  },
})

/**
 * Step 2 — auto-use fixture that attaches server process logs to FAILED tests.
 *
 * Attaches the tail of `backend.log` and `frontend.log` (up to 500 lines each)
 * from the fixture's log directory.  Only runs on failure to keep passing test
 * reports clean.
 */
export const test = withConsoleLogs.extend<{ _serverLogs: void }>({
  // eslint-disable-next-line no-empty-pattern
  _serverLogs: [async ({}, use, testInfo) => {
    await use()

    // Only attach when the test did not pass (failed, timed out, interrupted)
    if (testInfo.status === testInfo.expectedStatus) return

    const logDir = findLogDir()
    if (!logDir) return

    for (const fileName of ['backend.log', 'frontend.log']) {
      const filePath = join(logDir, fileName)
      if (!existsSync(filePath)) continue

      const attachmentName = fileName.replace('.log', '-log')
      await testInfo.attach(attachmentName, {
        body: tailFile(filePath),
        contentType: 'text/plain',
      })
    }
  }, { auto: true }],
})
