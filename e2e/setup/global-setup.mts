/**
 * Playwright global setup — runs once before all browser tests.
 *
 * Steps:
 *   1. Scaffold a minimal SPA app using the Vasp CLI
 *   2. Install its dependencies with `bun install`
 *   3. Build the Vite frontend (`bunx vite build`)
 *
 * The built dist/ is then served by Playwright's webServer (vite preview).
 */

import { spawnSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const MONOREPO_ROOT = resolve(__dirname, '..', '..')
const CLI_ENTRY = join(MONOREPO_ROOT, 'packages', 'cli', 'bin', 'vasp.ts')
const E2E_DIR = join(MONOREPO_ROOT, 'e2e')
const APP_NAME = '__pw_app__'
const APP_DIR = join(E2E_DIR, APP_NAME)

export default async function globalSetup() {
  // Remove a leftover directory from an interrupted previous run
  if (existsSync(APP_DIR)) {
    rmSync(APP_DIR, { recursive: true, force: true })
  }

  console.log('[playwright] Scaffolding test app with vasp new…')
  const scaffold = spawnSync('bun', [CLI_ENTRY, 'new', APP_NAME, '--no-install'], {
    cwd: E2E_DIR,
    encoding: 'utf8',
    timeout: 30_000,
  })
  if (scaffold.status !== 0) {
    throw new Error(`vasp new failed:\n${scaffold.stderr || scaffold.stdout}`)
  }

  console.log('[playwright] Installing dependencies with bun install…')
  const install = spawnSync('bun', ['install'], {
    cwd: APP_DIR,
    encoding: 'utf8',
    timeout: 120_000,
  })
  if (install.status !== 0) {
    throw new Error(`bun install failed:\n${install.stderr || install.stdout}`)
  }

  console.log('[playwright] Building frontend with vite build…')
  const build = spawnSync('bunx', ['vite', 'build'], {
    cwd: APP_DIR,
    encoding: 'utf8',
    timeout: 60_000,
  })
  if (build.status !== 0) {
    throw new Error(`vite build failed:\n${build.stderr || build.stdout}`)
  }

  console.log('[playwright] Setup complete — dist/ is ready.')
}
