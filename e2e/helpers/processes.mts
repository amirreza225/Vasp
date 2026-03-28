/**
 * Backend and frontend process management for the fullstack E2E suite.
 *
 * Spawns the Elysia backend and Vite dev server as detached child processes,
 * captures their logs to files, and provides helpers to wait until each
 * service is ready and to kill both on teardown.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createConnection } from 'node:net'

export interface ProcessHandle {
  process: ChildProcess
  pid: number
  logFile: string
}

/** Create a writable log stream, ensuring the directory exists. */
function openLog(path: string) {
  const dir = join(path, '..')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return createWriteStream(path, { flags: 'a' })
}

/**
 * Spawn the Elysia backend using the generated "dev:server" script.
 * Logs are tee'd to  logDir/backend.log .
 */
export function startBackend(
  appDir: string,
  env: Record<string, string>,
  logDir: string,
): ProcessHandle {
  const logFile = join(logDir, 'backend.log')
  const log = openLog(logFile)

  const proc = spawn('bun', ['run', 'dev:server'], {
    cwd: appDir,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  })

  proc.stdout?.pipe(log)
  proc.stderr?.pipe(log)

  if (!proc.pid) throw new Error('Failed to start backend process')
  return { process: proc, pid: proc.pid, logFile }
}

/**
 * Spawn the Vite dev server using the generated "dev:client" script.
 * Logs are tee'd to  logDir/frontend.log .
 */
export function startFrontend(
  appDir: string,
  env: Record<string, string>,
  logDir: string,
): ProcessHandle {
  const logFile = join(logDir, 'frontend.log')
  const log = openLog(logFile)

  const proc = spawn('bun', ['run', 'dev:client'], {
    cwd: appDir,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  })

  proc.stdout?.pipe(log)
  proc.stderr?.pipe(log)

  if (!proc.pid) throw new Error('Failed to start frontend process')
  return { process: proc, pid: proc.pid, logFile }
}

/** Wait until a TCP port is accepting connections (polls every 300 ms). */
export function waitForPort(port: number, host = 'localhost', timeoutMs = 30_000): Promise<void> {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = createConnection({ port, host })
      socket.on('connect', () => {
        socket.destroy()
        resolve()
      })
      socket.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Port ${port} did not open within ${timeoutMs}ms`))
        } else {
          setTimeout(attempt, 300)
        }
      })
    }
    attempt()
  })
}

/** Poll an HTTP URL until it returns a 2xx status (polls every 500 ms). */
export async function waitForHttp(url: string, timeoutMs = 30_000): Promise<void> {
  const start = Date.now()
  let lastError: unknown
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch (err) {
      lastError = err
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`${url} did not become available within ${timeoutMs}ms. Last error: ${lastError}`)
}

/** Send SIGTERM to a process handle, then SIGKILL after a grace period. */
export function stopProcess(handle: ProcessHandle, gracePeriodMs = 3_000): void {
  const { process: proc } = handle
  if (proc.exitCode !== null) return // already exited
  proc.kill('SIGTERM')
  const killTimer = setTimeout(() => {
    if (proc.exitCode === null) proc.kill('SIGKILL')
  }, gracePeriodMs)
  killTimer.unref()
}
