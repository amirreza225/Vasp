/**
 * Playwright global teardown for the fullstack E2E suite.
 *
 * Reads the state JSON written by fullstack-setup.mts and:
 *   1. Sends SIGTERM to the backend and frontend processes
 *   2. Drops the isolated test database
 *   3. Stops and removes the Postgres Docker container
 *   4. Removes the scaffolded app directory and log directory
 *   5. Removes the state file
 */

import { existsSync, readFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'
import { dropDatabase, stopPostgresContainer } from '../helpers/postgres.mts'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const E2E_DIR = resolve(__dirname, '..')
const STATE_FILE = join(E2E_DIR, '__e2e_state__.json')

function killPid(pid: number): void {
  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    // Process already exited — not an error
  }
}

export default async function globalTeardown() {
  if (!existsSync(STATE_FILE)) {
    console.log('[e2e-teardown] No state file found — nothing to tear down.')
    return
  }

  let state: Record<string, unknown>
  try {
    state = JSON.parse(readFileSync(STATE_FILE, 'utf8'))
  } catch {
    console.error('[e2e-teardown] Could not read state file — skipping teardown.')
    return
  }

  // ── 1. Stop backend + frontend processes ─────────────────────────────────
  if (typeof state.backendPid === 'number') {
    console.log(`[e2e-teardown] Stopping backend (PID ${state.backendPid})…`)
    killPid(state.backendPid)
  }
  if (typeof state.frontendPid === 'number') {
    console.log(`[e2e-teardown] Stopping frontend (PID ${state.frontendPid})…`)
    killPid(state.frontendPid)
  }

  // Give processes a moment to exit cleanly
  await new Promise((r) => setTimeout(r, 1_500))

  // ── 2. Drop isolated database ─────────────────────────────────────────────
  if (
    typeof state.containerId === 'string' &&
    typeof state.dbName === 'string' &&
    typeof state.pgPort === 'number'
  ) {
    console.log(`[e2e-teardown] Dropping database "${state.dbName}"…`)
    dropDatabase({ containerId: state.containerId, port: state.pgPort }, state.dbName)
  }

  // ── 3. Stop Postgres container ────────────────────────────────────────────
  if (typeof state.containerId === 'string') {
    console.log(`[e2e-teardown] Removing Postgres container ${state.containerId.slice(0, 12)}…`)
    stopPostgresContainer(state.containerId)
  }

  // ── 4. Remove scaffolded app directory ───────────────────────────────────
  const appDir = typeof state.appDir === 'string' ? state.appDir : null
  if (appDir && existsSync(appDir)) {
    console.log('[e2e-teardown] Removing app directory…')
    rmSync(appDir, { recursive: true, force: true })
  }

  // Remove log directory
  const logDir = typeof state.logDir === 'string' ? state.logDir : null
  if (logDir && existsSync(logDir)) {
    rmSync(logDir, { recursive: true, force: true })
  }

  // ── 5. Remove state file ──────────────────────────────────────────────────
  if (existsSync(STATE_FILE)) rmSync(STATE_FILE)

  console.log('[e2e-teardown] Cleanup complete.')
}
