import type { VaspAST } from '@vasp-framework/core'
import { parse as _parse } from './parser/Parser.js'
import { SemanticValidator } from './validator/SemanticValidator.js'

/**
 * Parse a .vasp source string into a validated VaspAST.
 * Throws ParseError on any syntax or semantic error.
 */
export function parse(source: string, filename = 'main.vasp'): VaspAST {
  const ast = _parse(source, filename)
  new SemanticValidator().validate(ast)
  return ast
}

export { Lexer } from './lexer/Lexer.js'
export { SemanticValidator } from './validator/SemanticValidator.js'
export { formatDiagnostics } from './errors/DiagnosticFormatter.js'
export type { Token } from './lexer/Token.js'
export { TokenType } from './lexer/TokenType.js'
