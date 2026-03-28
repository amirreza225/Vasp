/**
 * Playwright global setup for the fullstack E2E suite.
 *
 * Steps:
 *   1. Start a postgres:16-alpine Docker container on a random host port
 *   2. Wait until the DB is ready
 *   3. Create an isolated database named vasp_e2e_<timestamp>
 *   4. Scaffold a minimal app with  vasp new  (no install)
 *   5. Replace its main.vasp with the e2e-todo.vasp fixture
 *   6. Regenerate the app from the fixture with  vasp generate --force
 *   7. Patch package.json to reference the local @vasp-framework/runtime
 *   8. Write a .env with real test values (DB URL, JWT secret, magic token…)
 *   9. Install dependencies with  bun install
 *  10. Push the Drizzle schema with  bunx drizzle-kit push
 *  11. Start the Elysia backend (bun run dev:server) and wait for /api/health
 *  12. Start the Vite dev server (bun run dev:client) and wait for port 5173
 *
 * State (DB name, container ID, PIDs, magic token, etc.) is persisted to
 *   e2e/__e2e_state__.json
 * so that the fullstack-teardown.mts and individual tests can read it.
 *
 * Key environment variables surfaced to test workers:
 *   E2E_BACKEND_URL   http://localhost:3001
 *   E2E_MAGIC_TOKEN   random per-run bypass token
 *   E2E_STATE_FILE    absolute path to the state JSON
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

import {
  startPostgresContainer,
  waitForPostgres,
  createDatabase,
} from '../helpers/postgres.mts'
import { CLI_ENTRY, E2E_DIR, MONOREPO_ROOT, runVaspCli } from '../helpers/cli.mts'
import { startBackend, startFrontend, waitForHttp, waitForPort } from '../helpers/processes.mts'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

const FIXTURE = join(MONOREPO_ROOT, 'e2e', 'fixtures', 'e2e-todo.vasp')
const APP_NAME = '__e2e_app__'
const APP_DIR = join(E2E_DIR, APP_NAME)
const STATE_FILE = join(E2E_DIR, '__e2e_state__.json')
const LOG_DIR = join(E2E_DIR, '__e2e_logs__')
const BACKEND_PORT = 3001
const FRONTEND_PORT = 5173
// Random host port for Docker Postgres to avoid collisions
const PG_PORT = 25432 + Math.floor(Math.random() * 1000)

/** Write .env with real test values into the generated app directory. */
function writeEnvFile(appDir: string, values: Record<string, string>): void {
  const content = Object.entries(values)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
  writeFileSync(join(appDir, '.env'), content + '\n')
}

/** Patch package.json to use the local @vasp-framework/runtime workspace package. */
function patchPackageJson(appDir: string): void {
  const pkgPath = join(appDir, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  if (pkg.dependencies?.['@vasp-framework/runtime']) {
    pkg.dependencies['@vasp-framework/runtime'] =
      `file:${join(MONOREPO_ROOT, 'packages', 'runtime')}`
  }
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
}

/** Run a synchronous command and throw on failure with full output. */
function runSync(
  cmd: string,
  args: string[],
  cwd: string,
  label: string,
  timeoutMs = 120_000,
  extraEnv: Record<string, string> = {},
): string {
  const result = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    timeout: timeoutMs,
    // Pipe "yes\n" to stdin so interactive prompts (e.g., drizzle-kit push) are auto-confirmed
    input: 'y\n',
    env: { ...process.env, ...extraEnv },
  })
  if (result.status !== 0) {
    throw new Error(
      `${label} failed (exit ${result.status}):\nSTDOUT: ${result.stdout}\nSTDERR: ${result.stderr}`,
    )
  }
  return result.stdout ?? ''
}

export default async function globalSetup() {
  // Remove leftover directories from an interrupted previous run
  if (existsSync(APP_DIR)) rmSync(APP_DIR, { recursive: true, force: true })
  if (existsSync(STATE_FILE)) rmSync(STATE_FILE)

  const magicToken = `vasp-e2e-${randomUUID()}`

  // Mutable state written to disk so teardown can clean up even on crash
  const state: Record<string, unknown> = {
    appDir: APP_DIR,
    logDir: LOG_DIR,
    backendPort: BACKEND_PORT,
    frontendPort: FRONTEND_PORT,
    magicToken,
    containerId: null,
    pgPort: PG_PORT,
    dbName: null,
    dbUrl: null,
    backendPid: null,
    frontendPid: null,
    generation: { exitCode: null, semanticErrors: [], templateErrors: [], stderr: '' },
    errors: [] as string[],
  }

  const persist = () => writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))

  try {
    // ── 1. Start Postgres ──────────────────────────────────────────────────────
    console.log(`[e2e-setup] Starting Postgres on host port ${PG_PORT}…`)
    const pgHandle = startPostgresContainer(PG_PORT)
    state.containerId = pgHandle.containerId
    persist()

    // ── 2. Wait for Postgres to accept connections ─────────────────────────────
    console.log('[e2e-setup] Waiting for Postgres to be ready…')
    waitForPostgres(pgHandle)

    // ── 3. Create an isolated database ────────────────────────────────────────
    const dbName = `vasp_e2e_${Date.now()}`
    state.dbName = dbName
    const dbUrl = createDatabase(pgHandle, dbName)
    state.dbUrl = dbUrl
    persist()
    console.log(`[e2e-setup] Database "${dbName}" created.`)

    // ── 4. Scaffold minimal app (--no-install, we'll install in step 9) ───────
    console.log('[e2e-setup] Scaffolding app with vasp new…')
    const genResult = runVaspCli(['new', APP_NAME, '--no-install'], E2E_DIR, {}, 60_000)
    state.generation = {
      exitCode: genResult.exitCode,
      stdout: genResult.stdout,
      stderr: genResult.stderr,
      semanticErrors: genResult.semanticErrors,
      templateErrors: genResult.templateErrors,
    }
    persist()
    if (genResult.exitCode !== 0) {
      throw new Error(`vasp new failed:\n${genResult.stderr}`)
    }

    // ── 5. Replace main.vasp with the e2e fixture ────────────────────────────
    console.log('[e2e-setup] Replacing main.vasp with e2e-todo.vasp fixture…')
    writeFileSync(join(APP_DIR, 'main.vasp'), readFileSync(FIXTURE, 'utf8'))

    // ── 6. Regenerate from the e2e fixture ───────────────────────────────────
    console.log('[e2e-setup] Regenerating app from e2e-todo fixture…')
    const regenResult = runVaspCli(['generate', '--force'], APP_DIR, {}, 60_000)
    ;(state.generation as Record<string, unknown>).regenExitCode = regenResult.exitCode
    ;(state.generation as Record<string, unknown>).regenSemanticErrors =
      regenResult.semanticErrors
    persist()
    if (regenResult.exitCode !== 0) {
      throw new Error(`vasp generate failed:\n${regenResult.stderr}`)
    }

    // ── 7. Patch package.json for local runtime ──────────────────────────────
    console.log('[e2e-setup] Patching package.json for local workspace runtime…')
    patchPackageJson(APP_DIR)

    // ── 8. Write .env ─────────────────────────────────────────────────────────
    writeEnvFile(APP_DIR, {
      DATABASE_URL: dbUrl,
      PORT: String(BACKEND_PORT),
      VITE_API_URL: `http://localhost:${BACKEND_PORT}/api`,
      CORS_ORIGIN: `http://localhost:${FRONTEND_PORT}`,
      JWT_SECRET: 'vasp-e2e-jwt-secret-minimum-32-chars-ok',
      E2E_MAGIC_TOKEN: magicToken,
      NODE_ENV: 'test',
    })

    // ── 9. Install dependencies ───────────────────────────────────────────────
    console.log('[e2e-setup] Installing dependencies (bun install)…')
    runSync('bun', ['install'], APP_DIR, 'bun install', 120_000)

    // ── 10. Push Drizzle schema ───────────────────────────────────────────────
    console.log('[e2e-setup] Pushing DB schema (drizzle-kit push)…')
    runSync('bunx', ['drizzle-kit', 'push'], APP_DIR, 'drizzle-kit push', 60_000, {
      DATABASE_URL: dbUrl,
    })

    // ── 11. Start backend ─────────────────────────────────────────────────────
    console.log('[e2e-setup] Starting Elysia backend…')
    const backendEnv = {
      DATABASE_URL: dbUrl,
      PORT: String(BACKEND_PORT),
      VITE_API_URL: `http://localhost:${BACKEND_PORT}/api`,
      CORS_ORIGIN: `http://localhost:${FRONTEND_PORT}`,
      JWT_SECRET: 'vasp-e2e-jwt-secret-minimum-32-chars-ok',
      E2E_MAGIC_TOKEN: magicToken,
      NODE_ENV: 'test',
    }
    const backend = startBackend(APP_DIR, backendEnv, LOG_DIR)
    state.backendPid = backend.pid
    persist()

    await waitForHttp(`http://localhost:${BACKEND_PORT}/api/health`, 25_000)
    console.log('[e2e-setup] Backend is ready.')

    // ── 12. Start Vite dev server ─────────────────────────────────────────────
    console.log('[e2e-setup] Starting Vite dev server…')
    const frontendEnv = {
      VITE_API_URL: `http://localhost:${BACKEND_PORT}/api`,
    }
    const frontend = startFrontend(APP_DIR, frontendEnv, LOG_DIR)
    state.frontendPid = frontend.pid
    persist()

    await waitForPort(FRONTEND_PORT, 'localhost', 25_000)
    console.log('[e2e-setup] Frontend is ready.')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    ;(state.errors as string[]).push(msg)
    persist()
    throw err
  }

  persist()
  console.log('[e2e-setup] Fullstack E2E environment ready.')
  console.log(`[e2e-setup] Backend:  http://localhost:${BACKEND_PORT}`)
  console.log(`[e2e-setup] Frontend: http://localhost:${FRONTEND_PORT}`)

  // Expose key values to Playwright test workers via process.env
  process.env.E2E_BACKEND_URL = `http://localhost:${BACKEND_PORT}`
  process.env.E2E_MAGIC_TOKEN = magicToken
  process.env.E2E_STATE_FILE = STATE_FILE
  process.env.E2E_APP_DIR = APP_DIR
}
