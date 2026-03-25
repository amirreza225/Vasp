import { ParseError } from '@vasp-framework/core'
import { formatDiagnostics } from '@vasp-framework/parser'
import { log } from './logger.js'

/**
 * Handle a caught error from `parse()` or `generate()`.
 * - ParseError: render Rust-style diagnostics with source context
 * - Other errors: plain error message
 *
 * Exits the process with code 1.
 */
export function handleParseError(err: unknown, source: string, filename = 'main.vasp'): never {
  if (err instanceof ParseError) {
    const formatted = formatDiagnostics(err.diagnostics, source, filename)
    console.error('\n' + formatted + '\n')
    console.error(
      `\x1b[31m\x1b[1mAborted:\x1b[0m Found ${err.diagnostics.length} error${err.diagnostics.length === 1 ? '' : 's'} in ${filename}\n`,
    )
  } else {
    log.error(`Failed to parse ${filename}: ${String(err)}`)
  }
  process.exit(1)
}
