/**
 * Vasp CLI runner with structured error extraction.
 *
 * Wraps spawnSync so every invocation of the Vasp CLI returns a typed
 * result that includes raw output, parsed semantic error codes (E1xx),
 * and any Handlebars template parse errors.
 */

import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
export const MONOREPO_ROOT = resolve(__dirname, '..', '..')
export const CLI_ENTRY = join(MONOREPO_ROOT, 'packages', 'cli', 'bin', 'vasp.ts')
export const E2E_DIR = join(MONOREPO_ROOT, 'e2e')

export interface CliResult {
  exitCode: number | null
  stdout: string
  stderr: string
  /** Semantic error codes found in output, e.g. ["E100:", "E113:"] */
  semanticErrors: string[]
  /** Handlebars template parse errors found in output */
  templateErrors: string[]
  /** Duration in milliseconds */
  duration: number
}

/**
 * Run a Vasp CLI command synchronously and return a structured result.
 *
 * @param args   CLI arguments, e.g. ['new', 'my-app', '--no-install']
 * @param cwd    Working directory for the command
 * @param extraEnv  Additional environment variables to merge
 * @param timeout  Timeout in ms (default 60s)
 */
export function runVaspCli(
  args: string[],
  cwd: string,
  extraEnv: Record<string, string> = {},
  timeout = 60_000,
): CliResult {
  const start = Date.now()
  const result = spawnSync('bun', [CLI_ENTRY, ...args], {
    cwd,
    encoding: 'utf8',
    timeout,
    env: { ...process.env, ...extraEnv },
  })

  const combined = (result.stdout ?? '') + (result.stderr ?? '')

  return {
    exitCode: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    semanticErrors: [...combined.matchAll(/E1\d{2}:/g)].map((m) => m[0]),
    templateErrors: [...combined.matchAll(/(?:Parse error|Handlebars)[^\n]*/g)].map((m) => m[0]),
    duration: Date.now() - start,
  }
}

/**
 * Like runVaspCli but throws on non-zero exit codes.
 * Includes the full stdout+stderr in the error message.
 */
export function runVaspCliOrThrow(
  args: string[],
  cwd: string,
  label: string,
  extraEnv: Record<string, string> = {},
  timeout = 60_000,
): CliResult {
  const result = runVaspCli(args, cwd, extraEnv, timeout)
  if (result.exitCode !== 0) {
    throw new Error(
      `${label} failed (exit ${result.exitCode}):\nSTDOUT: ${result.stdout}\nSTDERR: ${result.stderr}`,
    )
  }
  return result
}
