import type { SourceLocation } from '../types/ast.js'
import { VaspError } from './VaspError.js'

export interface ParseDiagnostic {
  code: string
  message: string
  hint: string
  loc?: SourceLocation
}

export class ParseError extends VaspError {
  public readonly diagnostics: ParseDiagnostic[]

  constructor(diagnostics: ParseDiagnostic[]) {
    const first = diagnostics[0]
    const loc = first?.loc
    const locStr = loc ? ` (line ${loc.line}, col ${loc.col})` : ''
    const code = first?.code ?? 'E000_UNKNOWN'
    super(`[${code}]${locStr}: ${first?.message ?? 'Unknown error'}`, code)
    this.name = 'ParseError'
    this.diagnostics = diagnostics
  }

  /**
   * Fallback plain-text format (no source context).
   * For rich Rust-style output with source context, use DiagnosticFormatter.formatDiagnostics().
   */
  format(): string {
    return this.diagnostics
      .map((d) => {
        const loc = d.loc ? ` at line ${d.loc.line}:${d.loc.col}` : ''
        return `[${d.code}]${loc} ${d.message}\n  Hint: ${d.hint}`
      })
      .join('\n\n')
  }
}
