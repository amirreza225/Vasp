import { describe, expect, it } from 'vitest'
import { formatDiagnostics } from './DiagnosticFormatter.js'
import type { ParseDiagnostic } from '@vasp-framework/core'

// Strip ANSI color codes so assertions are color-agnostic
function strip(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '')
}

const SOURCE = `app TodoApp {
  title: "Todo"
  db: Drizzle
  ssr: false
  typescript: false
}

route HomeRoute {
  path: "/"
  to: NonExistentPage
}`

const DIAGNOSTIC: ParseDiagnostic = {
  code: 'E101_UNKNOWN_PAGE_REF',
  message: "Route 'HomeRoute' references unknown page 'NonExistentPage'",
  hint: "Add a page block named 'NonExistentPage'",
  loc: { line: 10, col: 7 },
}

describe('DiagnosticFormatter', () => {
  it('includes the error code in the header', () => {
    const out = strip(formatDiagnostics([DIAGNOSTIC], SOURCE))
    expect(out).toContain('E101_UNKNOWN_PAGE_REF')
  })

  it('includes the error message in the header', () => {
    const out = strip(formatDiagnostics([DIAGNOSTIC], SOURCE))
    expect(out).toContain("Route 'HomeRoute' references unknown page 'NonExistentPage'")
  })

  it('includes the file location line', () => {
    const out = strip(formatDiagnostics([DIAGNOSTIC], SOURCE))
    expect(out).toContain('--> main.vasp:10:7')
  })

  it('includes the error source line', () => {
    const out = strip(formatDiagnostics([DIAGNOSTIC], SOURCE))
    expect(out).toContain('to: NonExistentPage')
  })

  it('includes a caret pointing at the error column', () => {
    const out = strip(formatDiagnostics([DIAGNOSTIC], SOURCE))
    // Column 7 means 6 spaces then carets
    expect(out).toMatch(/\s{6}\^+/)
  })

  it('includes the hint', () => {
    const out = strip(formatDiagnostics([DIAGNOSTIC], SOURCE))
    expect(out).toContain("Add a page block named 'NonExistentPage'")
  })

  it('uses a custom filename when provided', () => {
    const out = strip(formatDiagnostics([DIAGNOSTIC], SOURCE, 'config.vasp'))
    expect(out).toContain('config.vasp:10:7')
  })

  it('formats multiple diagnostics separated by blank line', () => {
    const d2: ParseDiagnostic = {
      code: 'E112_DUPLICATE_ENTITY_NAME',
      message: "Duplicate entity name 'Todo'",
      hint: 'Entity names must be unique',
      loc: { line: 1, col: 1 },
    }
    const out = strip(formatDiagnostics([DIAGNOSTIC, d2], SOURCE))
    expect(out).toContain('E101_UNKNOWN_PAGE_REF')
    expect(out).toContain('E112_DUPLICATE_ENTITY_NAME')
    // Two diagnostics should be separated by a blank line
    expect(out.split('\n\n').length).toBeGreaterThanOrEqual(2)
  })

  it('handles diagnostic with no source location gracefully', () => {
    const noLoc: ParseDiagnostic = {
      code: 'E100_MISSING_APP_BLOCK',
      message: 'No app block found',
      hint: 'Add an app block to main.vasp',
      loc: { line: 0, col: 0 },
    }
    const out = strip(formatDiagnostics([noLoc], SOURCE))
    expect(out).toContain('E100_MISSING_APP_BLOCK')
    expect(out).toContain('No app block found')
    expect(out).toContain('Add an app block to main.vasp')
    // Should NOT crash or produce empty string
    expect(out.length).toBeGreaterThan(0)
  })

  it('guesses caret length based on token at error position', () => {
    // "NonExistentPage" starts at col 7 (1-based), so carets should be > 1
    const out = strip(formatDiagnostics([DIAGNOSTIC], SOURCE))
    const caretMatch = out.match(/\^+/)
    expect(caretMatch).not.toBeNull()
    expect(caretMatch![0]!.length).toBeGreaterThan(1)
  })
})
