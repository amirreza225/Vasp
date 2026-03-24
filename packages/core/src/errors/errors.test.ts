import { describe, expect, it } from 'vitest'
import { GeneratorError } from './GeneratorError.js'
import { ParseError } from './ParseError.js'
import { VaspError } from './VaspError.js'

describe('VaspError', () => {
  it('sets name and code', () => {
    const err = new VaspError('something failed', 'E001')
    expect(err.name).toBe('VaspError')
    expect(err.code).toBe('E001')
    expect(err.message).toBe('something failed')
    expect(err).toBeInstanceOf(Error)
  })
})

describe('ParseError', () => {
  it('formats a single diagnostic', () => {
    const err = new ParseError([
      {
        code: 'E001_MISSING_APP',
        message: 'No app block found',
        hint: 'Add an app { } block to your main.vasp file',
        loc: { line: 1, col: 1, offset: 0 },
      },
    ])
    expect(err.name).toBe('ParseError')
    expect(err.diagnostics).toHaveLength(1)
    expect(err.message).toContain('E001_MISSING_APP')
    expect(err.format()).toContain('E001_MISSING_APP')
    expect(err.format()).toContain('line 1:1')
    expect(err.format()).toContain('Hint:')
  })

  it('includes location in message when provided', () => {
    const err = new ParseError([
      {
        code: 'E002',
        message: 'Unexpected token',
        hint: 'Check your syntax',
        loc: { line: 5, col: 3, offset: 42 },
      },
    ])
    expect(err.message).toContain('line 5')
    expect(err.message).toContain('E002')
  })

  it('handles missing location', () => {
    const err = new ParseError([
      { code: 'E003', message: 'Bad input', hint: 'Try again' },
    ])
    expect(err.message).toBe('[E003]: Bad input')
  })
})

describe('GeneratorError', () => {
  it('stores generator name', () => {
    const err = new GeneratorError('failed to write file', 'BackendGenerator')
    expect(err.name).toBe('GeneratorError')
    expect(err.generatorName).toBe('BackendGenerator')
    expect(err.code).toBe('GENERATOR_ERROR')
  })
})
