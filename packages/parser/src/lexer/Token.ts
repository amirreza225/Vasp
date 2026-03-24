import type { SourceLocation } from '@vasp-framework/core'
import type { TokenType } from './TokenType.js'

export interface Token {
  type: TokenType
  value: string
  loc: SourceLocation
}
