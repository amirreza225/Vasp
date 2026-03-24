import { join, resolve } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { log } from '../utils/logger.js'
import pc from 'picocolors'

/**
 * `vasp start` — concurrent dev server orchestrator
 * Runs backend (Elysia/Bun) + frontend (Vite or Nuxt) in parallel,
 * prefixing each process's stdout/stderr with a colored label.
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

  log.step('Starting Vasp dev servers...')
  log.dim(`  server: ${serverScript}`)
  log.dim(`  client: ${clientScript}`)
  console.log()

  const [serverProc, clientProc] = await Promise.all([
    spawnPrefixed('server', pc.cyan, 'dev:server', projectDir),
    spawnPrefixed('client', pc.magenta, 'dev:client', projectDir),
  ])

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
