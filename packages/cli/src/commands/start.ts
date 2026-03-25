import { join, resolve } from 'node:path'
import { existsSync, readFileSync, writeFileSync, mkdirSync, watch } from 'node:fs'
import { createHash } from 'node:crypto'
import { log } from '../utils/logger.js'
import { runRegenerate } from './generate.js'
import { isPlaceholderValue, parseEnvFile } from '@vasp-framework/generator'
import { DEFAULT_SPA_PORT, DEFAULT_SSR_PORT } from '@vasp-framework/core'
import pc from 'picocolors'

/**
 * `vasp start` — concurrent dev server orchestrator
 *
 * Runs backend (Elysia/Bun) + frontend (Vite or Nuxt) in parallel,
 * prefixing each process's stdout/stderr with a colored label.
 *
 * Also watches main.vasp for changes and re-generates the project on save,
 * preserving user-modified files. The running dev servers pick up the
 * regenerated files automatically via their own hot-reload (Bun HMR / Vite HMR).
 */
export async function startCommand(): Promise<void> {
  const projectDir = resolve(process.cwd())
  const pkgFile = join(projectDir, 'package.json')

  if (!existsSync(pkgFile)) {
    log.error('No package.json found. Run this command inside a Vasp project.')
    process.exit(1)
  }

  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8')) as {
    scripts?: Record<string, string>
  }

  const serverScript = pkg.scripts?.['dev:server']
  const clientScript = pkg.scripts?.['dev:client']

  if (!serverScript || !clientScript) {
    log.error("Missing 'dev:server' or 'dev:client' scripts in package.json.")
    process.exit(1)
  }

  // Pre-flight checks
  const envFile = join(projectDir, '.env')
  if (!existsSync(envFile)) {
    log.warn('No .env file found. Copying from .env.example...')
    const exampleFile = join(projectDir, '.env.example')
    if (existsSync(exampleFile)) {
      const { copyFileSync } = await import('node:fs')
      copyFileSync(exampleFile, envFile)
      log.info('Created .env from .env.example — edit it to configure your database.')
    } else {
      log.warn('No .env.example found either. Database connection may fail.')
    }
  }

  // Warn about placeholder values in .env
  if (existsSync(envFile)) {
    const envContent = readFileSync(envFile, 'utf8')
    const envVars = parseEnvFile(envContent)
    if (envVars['DATABASE_URL'] && isPlaceholderValue(envVars['DATABASE_URL'])) {
      log.warn(pc.bold('DATABASE_URL looks like a placeholder — edit .env before running the app'))
    }
    if (envVars['JWT_SECRET'] && isPlaceholderValue(envVars['JWT_SECRET'])) {
      log.warn(pc.bold('JWT_SECRET is still a placeholder — set a real secret in .env'))
    }
  }

  const nodeModules = join(projectDir, 'node_modules')
  if (!existsSync(nodeModules)) {
    log.warn('node_modules not found. Running bun install...')
    const install = Bun.spawn(['bun', 'install'], {
      cwd: projectDir,
      stdout: 'inherit',
      stderr: 'inherit',
    })
    await install.exited
    if (install.exitCode !== 0) {
      log.error('bun install failed. Please install dependencies manually.')
      process.exit(1)
    }
  }

  // Auto-migrate: push schema if it changed since last run (dev only)
  if (process.env['NODE_ENV'] !== 'production') {
    await autoMigrateIfNeeded(projectDir)
  }

  log.step('Starting Vasp dev servers...')
  log.dim(`  server: ${serverScript}`)
  log.dim(`  client: ${clientScript}`)
  console.log()

  const [serverProc, clientProc] = await Promise.all([
    spawnPrefixed('server', pc.cyan, 'dev:server', projectDir),
    spawnPrefixed('client', pc.magenta, 'dev:client', projectDir),
  ])

  // Open the browser after a short delay to let the dev servers warm up
  openBrowser(projectDir)

  // Watch main.vasp and re-generate on change (debounced 300ms)
  const vaspFile = join(projectDir, 'main.vasp')
  if (existsSync(vaspFile)) {
    log.dim('  Watching main.vasp for changes...')
    watchVaspFile(vaspFile, projectDir)
  }

  // Handle Ctrl+C — kill both children
  process.on('SIGINT', () => {
    serverProc.kill()
    clientProc.kill()
    process.exit(0)
  })
  process.on('SIGTERM', () => {
    serverProc.kill()
    clientProc.kill()
    process.exit(0)
  })

  const [serverCode, clientCode] = await Promise.all([serverProc.exited, clientProc.exited])

  if (serverCode !== 0 || clientCode !== 0) {
    process.exit(1)
  }
}

/**
 * Detect if the Drizzle schema file has changed since the last `db push`.
 * If so, run `bunx drizzle-kit push` automatically before starting dev servers.
 * The schema hash is stored in `.vasp/schema-hash`.
 */
async function autoMigrateIfNeeded(projectDir: string): Promise<void> {
  const schemaTs = join(projectDir, 'drizzle', 'schema.ts')
  const schemaJs = join(projectDir, 'drizzle', 'schema.js')
  const schemaFile = existsSync(schemaTs) ? schemaTs : existsSync(schemaJs) ? schemaJs : null

  if (!schemaFile) return // no schema yet

  const content = readFileSync(schemaFile, 'utf8')
  const currentHash = createHash('sha256').update(content, 'utf8').digest('hex')

  const vaspDir = join(projectDir, '.vasp')
  const hashFile = join(vaspDir, 'schema-hash')

  const previousHash = existsSync(hashFile) ? readFileSync(hashFile, 'utf8').trim() : null

  if (previousHash === currentHash) return // schema unchanged

  const label = pc.yellow('[vasp]')
  const isFirstRun = previousHash === null
  if (isFirstRun) {
    process.stdout.write(`${label} First run — pushing schema to database...\n`)
  } else {
    process.stdout.write(`${label} Schema changed — running db push...\n`)
  }

  const pushProc = Bun.spawn(['bunx', 'drizzle-kit', 'push'], {
    cwd: projectDir,
    stdout: 'inherit',
    stderr: 'inherit',
  })
  const pushCode = await pushProc.exited

  if (pushCode === 0) {
    mkdirSync(vaspDir, { recursive: true })
    writeFileSync(hashFile, currentHash, 'utf8')
    process.stdout.write(`${label} ${pc.green('Schema pushed successfully')}\n`)
  } else {
    process.stdout.write(
      `${label} ${pc.yellow('db push failed — continuing anyway. Fix your DATABASE_URL and retry.')}\n`,
    )
  }
  console.log()
}

async function spawnPrefixed(
  label: string,
  color: (s: string) => string,
  scriptName: string,
  cwd: string,
): Promise<ReturnType<typeof Bun.spawn>> {
  const prefix = color(`[${label}]`)

  // Use `bun run <scriptName>` so Bun resolves node_modules/.bin binaries
  const proc = Bun.spawn(['bun', 'run', scriptName], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  })

  // Stream stdout with prefix
  streamWithPrefix(proc.stdout, prefix, process.stdout)
  streamWithPrefix(proc.stderr, prefix, process.stderr)

  return proc
}

async function streamWithPrefix(
  readable: ReadableStream<Uint8Array> | null,
  prefix: string,
  dest: NodeJS.WriteStream,
): Promise<void> {
  if (!readable) return
  const decoder = new TextDecoder()
  const reader = readable.getReader()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      if (buffer) dest.write(`${prefix} ${buffer}\n`)
      break
    }
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      dest.write(`${prefix} ${line}\n`)
    }
  }
}

/**
 * Watch main.vasp for changes. On each save:
 *  1. Debounce 300ms to ignore rapid successive writes (e.g. editor save storms)
 *  2. Run `runRegenerate()` — preserves user-modified files, only overwrites
 *     framework-owned generated files that differ from the manifest
 *  3. Print a concise summary so the developer knows what changed
 *
 * The dev servers (Bun + Vite) pick up the regenerated files automatically via
 * their own HMR — no restart is required.
 */
function watchVaspFile(vaspFile: string, projectDir: string): void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let generating = false

  watch(vaspFile, { persistent: false }, (_event) => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(async () => {
      if (generating) return
      generating = true

      const label = pc.yellow('[vasp]')
      process.stdout.write(`${label} main.vasp changed — regenerating...\n`)

      try {
        const result = await runRegenerate(projectDir)
        if (result.success) {
          const parts: string[] = []
          if (result.added > 0) parts.push(pc.green(`+${result.added} added`))
          if (result.updated > 0) parts.push(pc.cyan(`~${result.updated} updated`))
          if (result.skipped > 0) parts.push(pc.dim(`${result.skipped} preserved`))
          const summary = parts.length > 0 ? parts.join(', ') : 'no changes'
          process.stdout.write(`${label} ${pc.bold('Done')} — ${summary}\n`)
          if (result.skipped > 0) {
            process.stdout.write(`${label} ${pc.dim('User-modified files preserved. Use `vasp generate --force` to overwrite.')}\n`)
          }
        } else {
          process.stdout.write(`${label} ${pc.red('Generation failed:')}\n`)
          for (const err of result.errors) {
            process.stdout.write(`${label}   ${pc.red(err)}\n`)
          }
          process.stdout.write(`${label} ${pc.dim('Fix the error in main.vasp and save again.')}\n`)
        }
      } catch (err) {
        process.stdout.write(`${label} ${pc.red(`Unexpected error: ${String(err)}`)}\n`)
      } finally {
        generating = false
      }
    }, 300)
  })
}

/**
 * Open the browser after a short delay (1.5 s) to let the dev servers warm up.
 * Reads the SSR flag from main.vasp to determine the correct port.
 * Silently no-ops in headless / CI environments where the open command fails.
 */
function openBrowser(projectDir: string): void {
  const vaspFile = join(projectDir, 'main.vasp')
  let isSsr = false
  if (existsSync(vaspFile)) {
    const source = readFileSync(vaspFile, 'utf8')
    isSsr = /ssr:\s*true/.test(source) || /ssr:\s*"ssg"/.test(source)
  }

  const port = isSsr ? DEFAULT_SSR_PORT : DEFAULT_SPA_PORT
  const url = `http://localhost:${port}`

  setTimeout(() => {
    const label = pc.yellow('[vasp]')
    process.stdout.write(`${label} ${pc.cyan(url)} — opening in browser...\n`)

    let cmd: string
    if (process.platform === 'darwin') {
      cmd = 'open'
    } else if (process.platform === 'win32') {
      cmd = 'cmd'
    } else {
      cmd = 'xdg-open'
    }

    try {
      const spawnArgs: [string, ...string[]] =
        process.platform === 'win32' ? [cmd, '/c', 'start', url] : [cmd, url]
      Bun.spawn(spawnArgs, { stdout: 'ignore', stderr: 'ignore' })
    } catch {
      // Silently ignore — CI or headless environments without a display server
    }
  }, 1500)
}
