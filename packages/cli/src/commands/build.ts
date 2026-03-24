import { join, resolve } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { log } from '../utils/logger.js'

/**
 * `vasp build` — production build
 * Runs `bun build` for the Elysia backend and `vite build` / `nuxt build` for the frontend.
 */
export async function buildCommand(): Promise<void> {
  const projectDir = resolve(process.cwd())
  const pkgFile = join(projectDir, 'package.json')

  if (!existsSync(pkgFile)) {
    log.error('No package.json found. Run this command inside a Vasp project.')
    process.exit(1)
  }

  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8')) as {
    scripts?: Record<string, string>
    dependencies?: Record<string, string>
  }

  const isSsr = !!(pkg.dependencies?.['nuxt'])

  log.step('Building Vasp app for production...')

  // Step 1: build backend with bun
  log.info('Building backend...')
  const backendEntry = existsSync(join(projectDir, 'server/index.ts'))
    ? 'server/index.ts'
    : 'server/index.js'

  const backendProc = Bun.spawn(
    ['bun', 'build', backendEntry, '--target', 'bun', '--outdir', 'dist/server'],
    { cwd: projectDir, stdout: 'inherit', stderr: 'inherit' },
  )
  const backendCode = await backendProc.exited
  if (backendCode !== 0) {
    log.error('Backend build failed.')
    process.exit(1)
  }
  log.success('Backend built → dist/server/')

  // Step 2: build frontend
  log.info(`Building frontend (${isSsr ? 'Nuxt SSR' : 'Vite SPA'})...`)
  const frontendArgs = isSsr
    ? ['nuxt', 'build']
    : ['vite', 'build']

  const frontendProc = Bun.spawn(frontendArgs, {
    cwd: projectDir,
    stdout: 'inherit',
    stderr: 'inherit',
  })
  const frontendCode = await frontendProc.exited
  if (frontendCode !== 0) {
    log.error('Frontend build failed.')
    process.exit(1)
  }
  log.success(`Frontend built → ${isSsr ? '.output/' : 'dist/'}`)

  log.step('Build complete!')
  log.dim('  Run: node dist/server/index.js   (backend)')
  if (isSsr) {
    log.dim('  Run: node .output/server/index.mjs  (Nuxt SSR)')
  }
}
