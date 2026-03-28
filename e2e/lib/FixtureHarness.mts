/**
 * FixtureHarness — the core class that manages the full lifecycle of one
 * E2E fixture suite:
 *
 *   1. Optionally start Redis / RabbitMQ / Kafka / MinIO / Mailpit containers
 *   2. Start a per-fixture Docker Postgres container
 *   3. Create an isolated database
 *   4. `vasp new` + copy fixture → `vasp generate --force`
 *   5. Patch package.json for the local @vasp-framework/runtime
 *   6. Write a .env with all required values
 *   7. `bun install` + `bunx drizzle-kit push`
 *   8. Optionally seed multi-tenant workspace data directly via psql
 *   9. Start the Elysia backend; wait for /api/health
 *  10. Optionally start the Vite/Nuxt dev server; wait for the port
 *  11. Persist state to  e2e/__e2e_state_{name}__.json
 *  12. Expose env vars to Playwright worker processes
 *
 * Teardown reverses every step in order, cleaning up even on partial failure.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

import {
  startPostgresContainer,
  waitForPostgres,
  createDatabase,
  dropDatabase,
  stopPostgresContainer,
  PG_USER,
  PG_PASS,
} from '../helpers/postgres.mts'
import { runVaspCli } from '../helpers/cli.mts'
import { startBackend, startFrontend, waitForHttp, waitForPort } from '../helpers/processes.mts'
import {
  startRedisContainer,
  waitForRedis,
  startRabbitMQContainer,
  waitForRabbitMQ,
  startKafkaContainer,
  waitForKafka,
  startMinIOContainer,
  waitForMinIO,
  startMailpitContainer,
  waitForMailpit,
  stopContainer,
  MINIO_ROOT_USER,
  MINIO_ROOT_PASS,
} from './docker-services.mts'
import { parseCapabilities, MINIO_ROOT_USER_PLACEHOLDER, MINIO_ROOT_PASS_PLACEHOLDER } from './fixture-registry.mts'
import type {
  FixtureConfig,
  FixtureState,
  ServiceHandles,
} from './types.mts'

// ── helpers ───────────────────────────────────────────────────────────────────

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const MONOREPO_ROOT = resolve(__dirname, '..', '..')
const E2E_DIR = join(MONOREPO_ROOT, 'e2e')
const RUNTIME_PKG_DIR = join(MONOREPO_ROOT, 'packages', 'runtime')

function sleepMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function stateFilePath(name: string): string {
  return join(E2E_DIR, `__e2e_state_${name}__.json`)
}

function appDirPath(name: string): string {
  return join(E2E_DIR, `__e2e_app_${name.replace(/-/g, '_')}__`)
}

function logDirPath(name: string): string {
  return join(E2E_DIR, `__e2e_logs_${name}__`)
}

function envKey(name: string): string {
  return name.toUpperCase().replace(/-/g, '_')
}

/** Write .env file into the generated app directory. */
function writeEnvFile(appDir: string, values: Record<string, string>): void {
  const content = Object.entries(values)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
  writeFileSync(join(appDir, '.env'), content + '\n')
}

/** Patch package.json so @vasp-framework/runtime resolves from the local monorepo. */
function patchPackageJson(appDir: string): void {
  const pkgPath = join(appDir, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
    dependencies?: Record<string, string>
  }
  if (pkg.dependencies?.['@vasp-framework/runtime']) {
    pkg.dependencies['@vasp-framework/runtime'] = `file:${RUNTIME_PKG_DIR}`
  }
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
}

/** Run a command synchronously; throw on failure with full output. */
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
    // Auto-confirm interactive prompts (e.g., drizzle-kit push)
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

/**
 * Run a raw psql statement inside the Postgres Docker container and return
 * the stdout. Used for seeding data before the backend starts.
 */
function psqlExec(
  containerId: string,
  dbName: string,
  sql: string,
  timeoutMs = 15_000,
): string {
  const result = spawnSync(
    'docker',
    ['exec', containerId, 'psql', '-U', PG_USER, '-d', dbName, '-c', sql],
    { encoding: 'utf8', timeout: timeoutMs },
  )
  if (result.status !== 0) {
    throw new Error(
      `psql failed:\nSQL: ${sql}\nSTDOUT: ${result.stdout}\nSTDERR: ${result.stderr}`,
    )
  }
  return result.stdout
}

/** Parse "INSERT 0 1\n id \n----\n 42\n" style output and return the integer id. */
function parseInsertedId(psqlOutput: string): number {
  const lines = psqlOutput.trim().split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10)
  }
  throw new Error(`Could not parse inserted id from psql output:\n${psqlOutput}`)
}

// ── FixtureHarness ────────────────────────────────────────────────────────────

export class FixtureHarness {
  private readonly cfg: FixtureConfig
  private readonly stateFile: string
  private readonly appDir: string
  private readonly logDir: string

  constructor(cfg: FixtureConfig) {
    this.cfg = cfg
    this.stateFile = stateFilePath(cfg.name)
    this.appDir = appDirPath(cfg.name)
    this.logDir = logDirPath(cfg.name)
  }

  // ── setup ─────────────────────────────────────────────────────────────────

  async setup(): Promise<void> {
    const { cfg, stateFile, appDir, logDir } = this

    // Clean up leftovers from previous interrupted run
    if (existsSync(appDir)) rmSync(appDir, { recursive: true, force: true })
    if (existsSync(stateFile)) rmSync(stateFile)
    if (existsSync(logDir)) rmSync(logDir, { recursive: true, force: true })
    mkdirSync(logDir, { recursive: true })

    const magicToken = `vasp-e2e-${randomUUID()}`
    const capabilities = parseCapabilities(cfg.fixturePath)

    const state: FixtureState = {
      name: cfg.name,
      appDir,
      logDir,
      stateFile,
      backendUrl: `http://localhost:${cfg.backendPort}`,
      frontendUrl: cfg.frontendPort ? `http://localhost:${cfg.frontendPort}` : null,
      magicToken,
      dbUrl: '',
      backendPid: null,
      frontendPid: null,
      services: {} as ServiceHandles,
      generation: {
        exitCode: null,
        stdout: '',
        stderr: '',
        semanticErrors: [],
        templateErrors: [],
      },
      capabilities,
      seedData: {},
      errors: [],
    }

    const persist = () => writeFileSync(stateFile, JSON.stringify(state, null, 2))

    try {
      // ── 1. Optional extra services ──────────────────────────────────────
      if (cfg.redisPort) {
        console.log(`[harness:${cfg.name}] Starting Redis on port ${cfg.redisPort}…`)
        const redisHandle = startRedisContainer(cfg.redisPort)
        await waitForRedis(redisHandle)
        state.services.redis = redisHandle
        persist()
      }

      if (cfg.rabbitAmqpPort && cfg.rabbitManagementPort) {
        console.log(`[harness:${cfg.name}] Starting RabbitMQ on port ${cfg.rabbitAmqpPort}…`)
        const rabbitHandle = startRabbitMQContainer(cfg.rabbitAmqpPort, cfg.rabbitManagementPort)
        await waitForRabbitMQ(rabbitHandle)
        state.services.rabbit = rabbitHandle
        persist()
      }

      if (cfg.kafkaPort) {
        console.log(`[harness:${cfg.name}] Starting Kafka on port ${cfg.kafkaPort}…`)
        const kafkaHandle = startKafkaContainer(cfg.kafkaPort)
        // waitForKafka is synchronous (uses spawnSync polling) — no await needed
        waitForKafka(kafkaHandle)
        state.services.kafka = kafkaHandle
        persist()
      }

      if (cfg.minioApiPort && cfg.minioConsolePort) {
        console.log(`[harness:${cfg.name}] Starting MinIO on port ${cfg.minioApiPort}…`)
        const minioHandle = startMinIOContainer(cfg.minioApiPort, cfg.minioConsolePort)
        await waitForMinIO(minioHandle)
        state.services.minio = minioHandle
        persist()
      }

      if (cfg.mailpitSmtpPort && cfg.mailpitWebPort) {
        console.log(`[harness:${cfg.name}] Starting Mailpit on SMTP ${cfg.mailpitSmtpPort}…`)
        const mailpitHandle = startMailpitContainer(cfg.mailpitSmtpPort, cfg.mailpitWebPort)
        await waitForMailpit(mailpitHandle)
        state.services.mailpit = mailpitHandle
        persist()
      }

      // ── 2. Start Postgres ───────────────────────────────────────────────
      console.log(`[harness:${cfg.name}] Starting Postgres on port ${cfg.pgPort}…`)
      const pgHandle = startPostgresContainer(cfg.pgPort)
      state.services.pg = pgHandle
      persist()

      // ── 3. Wait + create DB ─────────────────────────────────────────────
      console.log(`[harness:${cfg.name}] Waiting for Postgres…`)
      waitForPostgres(pgHandle)
      const dbName = `vasp_e2e_${cfg.name.replace(/-/g, '_')}_${Date.now()}`
      const dbUrl = createDatabase(pgHandle, dbName)
      state.dbUrl = dbUrl
      persist()

      // ── 4. vasp new (scaffold skeleton) ────────────────────────────────
      console.log(`[harness:${cfg.name}] Running vasp new…`)
      const appName = `__e2e_app_${cfg.name.replace(/-/g, '_')}__`
      const newResult = runVaspCli(['new', appName, '--no-install'], E2E_DIR, {}, 60_000)
      state.generation.exitCode = newResult.exitCode
      state.generation.stdout = newResult.stdout
      state.generation.stderr = newResult.stderr
      state.generation.semanticErrors = newResult.semanticErrors
      state.generation.templateErrors = newResult.templateErrors
      persist()
      if (newResult.exitCode !== 0) {
        throw new Error(`vasp new failed:\n${newResult.stderr}`)
      }

      // ── 5. Replace main.vasp with fixture ────────────────────────────
      console.log(`[harness:${cfg.name}] Installing fixture: ${cfg.fixturePath}`)
      writeFileSync(join(appDir, 'main.vasp'), readFileSync(cfg.fixturePath, 'utf8'))

      // ── 6. vasp generate --force ────────────────────────────────────
      console.log(`[harness:${cfg.name}] Regenerating from fixture…`)
      const regenStart = Date.now()
      const regenResult = runVaspCli(['generate', '--force'], appDir, {}, 120_000)
      state.generation.regenExitCode = regenResult.exitCode
      state.generation.regenSemanticErrors = regenResult.semanticErrors
      state.generation.regenTemplateErrors = regenResult.templateErrors
      state.generation.durationMs = Date.now() - regenStart
      persist()
      if (regenResult.exitCode !== 0) {
        throw new Error(`vasp generate failed:\n${regenResult.stderr}`)
      }

      // ── 7. Patch package.json for local runtime ──────────────────────
      patchPackageJson(appDir)

      // ── 8. Write .env ──────────────────────────────────────────────
      const baseEnv: Record<string, string> = {
        DATABASE_URL: dbUrl,
        PORT: String(cfg.backendPort),
        VITE_API_URL: `http://localhost:${cfg.backendPort}/api`,
        NUXT_PUBLIC_API_URL: `http://localhost:${cfg.backendPort}/api`,
        CORS_ORIGIN: cfg.frontendPort ? `http://localhost:${cfg.frontendPort}` : '*',
        JWT_SECRET: 'vasp-e2e-jwt-secret-minimum-32-chars-xxxx',
        E2E_MAGIC_TOKEN: magicToken,
        NODE_ENV: 'test',
        ...(cfg.extraEnv ?? {}),
      }

      // Replace MinIO placeholders now that we know the real credentials
      if (state.services.minio) {
        for (const [k, v] of Object.entries(baseEnv)) {
          if (v === MINIO_ROOT_USER_PLACEHOLDER) baseEnv[k] = MINIO_ROOT_USER
          if (v === MINIO_ROOT_PASS_PLACEHOLDER) baseEnv[k] = MINIO_ROOT_PASS
        }
      }

      writeEnvFile(appDir, baseEnv)

      // ── 9. bun install ─────────────────────────────────────────────
      console.log(`[harness:${cfg.name}] Installing dependencies…`)
      runSync('bun', ['install'], appDir, 'bun install', 180_000)

      // ── 10. drizzle-kit push ───────────────────────────────────────
      console.log(`[harness:${cfg.name}] Pushing DB schema…`)
      runSync('bunx', ['drizzle-kit', 'push'], appDir, 'drizzle-kit push', 60_000, {
        DATABASE_URL: dbUrl,
      })

      // ── 11. Seed workspace (multi-tenant) ──────────────────────────
      if (cfg.seedWorkspace && capabilities.hasMultiTenant) {
        console.log(`[harness:${cfg.name}] Seeding multi-tenant workspaces…`)
        state.seedData = await this.seedWorkspaces(pgHandle.containerId, dbName)
        persist()
      }

      // ── 12. Start backend ──────────────────────────────────────────
      console.log(`[harness:${cfg.name}] Starting backend on port ${cfg.backendPort}…`)
      const backendEnv = { ...baseEnv }
      const backend = startBackend(appDir, backendEnv, logDir)
      state.backendPid = backend.pid
      persist()
      await waitForHttp(`http://localhost:${cfg.backendPort}/api/health`, 45_000)
      console.log(`[harness:${cfg.name}] Backend ready.`)

      // ── 13. Start frontend (optional) ──────────────────────────────
      if (cfg.startFrontend && cfg.frontendPort) {
        console.log(
          `[harness:${cfg.name}] Starting ${cfg.frontendType ?? 'vite'} frontend on port ${cfg.frontendPort}…`,
        )
        const frontendEnv: Record<string, string> = {
          VITE_API_URL: `http://localhost:${cfg.backendPort}/api`,
          NUXT_PUBLIC_API_URL: `http://localhost:${cfg.backendPort}/api`,
          PORT: String(cfg.frontendPort),
          NUXT_PORT: String(cfg.frontendPort),
        }
        const frontend = startFrontend(appDir, frontendEnv, logDir)
        state.frontendPid = frontend.pid
        persist()

        if (cfg.frontendType === 'nuxt') {
          // Nuxt serves HTTP, wait for the port + a brief grace period
          await waitForPort(cfg.frontendPort, 'localhost', 120_000)
          // Extra wait for Nuxt's Nitro server to be fully ready
          await new Promise((r) => setTimeout(r, 3_000))
        } else {
          await waitForPort(cfg.frontendPort, 'localhost', 60_000)
        }
        console.log(`[harness:${cfg.name}] Frontend ready.`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      state.errors.push(msg)
      persist()
      throw err
    }

    persist()

    // ── Expose state to Playwright worker processes ────────────────────────
    const prefix = `E2E_${envKey(cfg.name)}`
    process.env[`${prefix}_BACKEND_URL`] = state.backendUrl
    process.env[`${prefix}_FRONTEND_URL`] = state.frontendUrl ?? ''
    process.env[`${prefix}_MAGIC_TOKEN`] = state.magicToken
    process.env[`${prefix}_STATE_FILE`] = stateFile
    process.env[`${prefix}_APP_DIR`] = appDir

    console.log(`[harness:${cfg.name}] Setup complete.`)
    console.log(`[harness:${cfg.name}]   Backend:  ${state.backendUrl}`)
    if (state.frontendUrl) {
      console.log(`[harness:${cfg.name}]   Frontend: ${state.frontendUrl}`)
    }
  }

  // ── teardown ──────────────────────────────────────────────────────────────

  async teardown(): Promise<void> {
    const { stateFile, appDir, logDir } = this

    if (!existsSync(stateFile)) {
      console.log(`[harness:${this.cfg.name}] No state file — nothing to tear down.`)
      return
    }

    let state: FixtureState
    try {
      state = JSON.parse(readFileSync(stateFile, 'utf8')) as FixtureState
    } catch {
      console.error(`[harness:${this.cfg.name}] Could not read state file; skipping teardown.`)
      return
    }

    // ── 1. Kill processes ────────────────────────────────────────────────
    if (typeof state.frontendPid === 'number') this.killPid(state.frontendPid)
    if (typeof state.backendPid === 'number') this.killPid(state.backendPid)
    await new Promise((r) => setTimeout(r, 1_500))

    // ── 2. Drop DB ───────────────────────────────────────────────────────
    const pg = state.services?.pg
    if (pg && state.dbUrl) {
      const dbName = new URL(state.dbUrl).pathname.slice(1)
      console.log(`[harness:${this.cfg.name}] Dropping database "${dbName}"…`)
      dropDatabase(pg, dbName)
    }

    // ── 3. Stop Docker containers ────────────────────────────────────────
    const svc = state.services ?? {}
    if (svc.pg) {
      console.log(`[harness:${this.cfg.name}] Stopping Postgres…`)
      stopPostgresContainer(svc.pg.containerId)
    }
    if (svc.redis) stopContainer(svc.redis.containerId)
    if (svc.rabbit) stopContainer(svc.rabbit.containerId)
    if (svc.kafka) stopContainer(svc.kafka.containerId)
    if (svc.minio) stopContainer(svc.minio.containerId)
    if (svc.mailpit) stopContainer(svc.mailpit.containerId)

    // ── 4. Remove app + log directories ─────────────────────────────────
    if (existsSync(appDir)) rmSync(appDir, { recursive: true, force: true })
    if (existsSync(logDir)) rmSync(logDir, { recursive: true, force: true })
    if (existsSync(stateFile)) rmSync(stateFile)

    console.log(`[harness:${this.cfg.name}] Teardown complete.`)
  }

  // ── private helpers ────────────────────────────────────────────────────────

  private killPid(pid: number): void {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      // already exited
    }
  }

  /**
   * Seed two Workspace rows (alpha + beta) and return their IDs plus
   * pre-created tasks for tenant-isolation tests.
   * Uses `cfg.workspaceSeed` when present for fixtures with more required columns.
   */
  private async seedWorkspaces(
    containerId: string,
    dbName: string,
  ): Promise<Record<string, unknown>> {
    const ws = this.cfg.workspaceSeed

    // ── Insert workspace alpha ────────────────────────────────────────────
    const alphaColumns = ws?.columns ?? 'name'
    const alphaValues = ws?.alphaValues ?? `'workspace-alpha'`
    const wsAlphaOut = psqlExec(
      containerId,
      dbName,
      `INSERT INTO workspace (${alphaColumns}) VALUES (${alphaValues}) RETURNING id;`,
    )
    const workspaceAlphaId = parseInsertedId(wsAlphaOut)

    // ── Insert workspace beta ─────────────────────────────────────────────
    const betaValues = ws?.betaValues ?? `'workspace-beta'`
    const wsBetaOut = psqlExec(
      containerId,
      dbName,
      `INSERT INTO workspace (${alphaColumns}) VALUES (${betaValues}) RETURNING id;`,
    )
    const workspaceBetaId = parseInsertedId(wsBetaOut)

    // ── Seed tasks in each workspace ──────────────────────────────────────
    // For multi-tenant fixture (simple Task: title, done, workspaceId)
    if (!ws?.alphaTaskValues) {
      try {
        psqlExec(
          containerId,
          dbName,
          `INSERT INTO task (title, done, "workspaceId") VALUES ('Alpha Task 1', false, ${Number(workspaceAlphaId)}), ('Alpha Task 2', true, ${Number(workspaceAlphaId)});`,
        )
        psqlExec(
          containerId,
          dbName,
          `INSERT INTO task (title, done, "workspaceId") VALUES ('Beta Task 1', false, ${Number(workspaceBetaId)});`,
        )
      } catch {
        // Task table may not exist or have different schema — non-fatal for workspace seed
        console.warn(`[harness:${this.cfg.name}] Could not seed tasks (non-fatal): table may not exist yet`)
      }
    } else if (ws?.alphaTaskValues) {
      // Project-hub has more complex Task schema: title, status, priority, done, etc.
      // The alphaTaskValues/betaTaskValues come from config
      // For project-hub we skip task seeding here (tasks are created by tests)
    }

    return {
      workspaceAlphaId,
      workspaceBetaId,
      alphaTaskCount: ws?.alphaTaskValues ? 0 : 2,
      betaTaskCount: ws?.betaValues ? 0 : 1,
    }
  }
}

// ── standalone state reader (for test files) ──────────────────────────────────

/**
 * Read the persisted fixture state from disk.
 * Called at module load time in each test file.
 */
export function readFixtureState(fixtureName: string): FixtureState {
  const path = stateFilePath(fixtureName)
  if (!existsSync(path)) {
    throw new Error(
      `Fixture state file not found: ${path}\n` +
        `Did the globalSetup for "${fixtureName}" complete successfully?`,
    )
  }
  return JSON.parse(readFileSync(path, 'utf8')) as FixtureState
}

/** Helper: unwrap the { ok, data } envelope from errorHandler middleware. */
export function unwrap(body: unknown): unknown {
  if (body && typeof body === 'object' && 'data' in body) {
    return (body as { data: unknown }).data
  }
  return body
}
