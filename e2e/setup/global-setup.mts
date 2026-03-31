/**
 * Playwright global setup — runs once before all browser tests.
 *
 * Steps:
 *   1. Scaffold a minimal SPA app using the Vasp CLI
 *   2. Patch package.json to use local workspace packages (file: refs)
 *   3. Install its dependencies with `bun install`
 *   4. Build the Vite frontend (`bun x vite build`)
 *   5. Start `vite preview` on port 4173
 *
 * The preview server is stopped in global-teardown.
 */

import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const MONOREPO_ROOT = resolve(__dirname, '..', '..')
const CLI_ENTRY = join(MONOREPO_ROOT, 'packages', 'cli', 'bin', 'vasp.ts')
const E2E_DIR = join(MONOREPO_ROOT, 'e2e')
const APP_NAME = '__pw_app__'
const APP_DIR = join(E2E_DIR, APP_NAME)
const PREVIEW_PORT = 4173

function runSync(cmd: string, args: string[], cwd: string, label: string, timeout = 60_000) {
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit', timeout })
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}`)
  }
}

function waitForPort(port: number, host = 'localhost', timeout = 30_000): Promise<void> {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const check = () => {
      const net = createRequire(import.meta.url)('net') as typeof import('net')
      const socket = net.createConnection({ port, host })
      socket.on('connect', () => { socket.destroy(); resolve() })
      socket.on('error', () => {
        if (Date.now() - start > timeout) {
          reject(new Error(`Port ${port} did not open within ${timeout}ms`))
        } else {
          setTimeout(check, 200)
        }
      })
    }
    check()
  })
}

// Store the preview server process so teardown can kill it
let previewProcess: ChildProcess | undefined

export default async function globalSetup() {
  // Remove a leftover directory from an interrupted previous run
  if (existsSync(APP_DIR)) {
    rmSync(APP_DIR, { recursive: true, force: true })
  }

  console.log('[playwright] Scaffolding test app with vasp new…')
  runSync('bun', [CLI_ENTRY, 'new', APP_NAME, '--no-install'], E2E_DIR, 'vasp new', 30_000)

  // Patch package.json so @vasp-framework/runtime resolves from the local
  // monorepo instead of npm (the package is not published yet).
  console.log('[playwright] Patching package.json for local workspace refs…')
  const pkgPath = join(APP_DIR, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  if (pkg.dependencies?.['@vasp-framework/runtime']) {
    pkg.dependencies['@vasp-framework/runtime'] = 'file:../../packages/runtime'
  }
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

  console.log('[playwright] Installing dependencies with bun install…')
  runSync('bun', ['install'], APP_DIR, 'bun install', 120_000)

  // @vasp-framework/runtime is installed via a file: symlink into the monorepo.
  // Vite requires dist/index.js to exist at that path; build it if missing
  // (e.g. when running locally before `bun run build`, or if the CI artifact
  // download did not restore the dist/ directory).
  const runtimeDist = join(MONOREPO_ROOT, 'packages', 'runtime', 'dist', 'index.js')
  if (!existsSync(runtimeDist)) {
    console.log('[playwright] Building @vasp-framework/runtime (dist/ missing)…')
    runSync('bun', ['run', 'build'], join(MONOREPO_ROOT, 'packages', 'runtime'), 'runtime build', 60_000)
  }

  console.log('[playwright] Building frontend with vite build…')
  runSync('bun', ['x', 'vite', 'build'], APP_DIR, 'vite build', 60_000)

  console.log('[playwright] Starting vite preview server on port', PREVIEW_PORT, '…')
  previewProcess = spawn('bun', ['x', 'vite', 'preview', '--port', String(PREVIEW_PORT)], {
    cwd: APP_DIR,
    stdio: 'pipe',
  })
  previewProcess.on('error', (err) => {
    console.error('[playwright] vite preview error:', err)
  })

  await waitForPort(PREVIEW_PORT)
  console.log('[playwright] Preview server is ready.')

  // Return a teardown function that Playwright will call after all tests
  return async () => {
    if (previewProcess) {
      previewProcess.kill()
      previewProcess = undefined
    }
  }
}
