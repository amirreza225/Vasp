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

  log.step('Starting Vasp dev servers...')
  log.dim(`  server: ${serverScript}`)
  log.dim(`  client: ${clientScript}`)
  console.log()

  const [serverProc, clientProc] = await Promise.all([
    spawnPrefixed('server', pc.cyan, serverScript, projectDir),
    spawnPrefixed('client', pc.magenta, clientScript, projectDir),
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
  script: string,
  cwd: string,
): Promise<ReturnType<typeof Bun.spawn>> {
  const prefix = color(`[${label}]`)
  const [cmd, ...args] = script.split(' ')

  const proc = Bun.spawn([cmd!, ...args], {
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
