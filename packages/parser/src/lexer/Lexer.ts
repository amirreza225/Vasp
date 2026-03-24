import { ParseError } from '@vasp/core'
import type { Token } from './Token.js'
import { ALL_KEYWORDS, BLOCK_KEYWORDS, TokenType } from './TokenType.js'

export class Lexer {
  private pos = 0
  private line = 1
  private col = 1
  private readonly tokens: Token[] = []

  constructor(
    private readonly source: string,
    private readonly filename: string = 'main.vasp',
  ) {}

  tokenize(): Token[] {
    while (this.pos < this.source.length) {
      this.skipWhitespaceAndComments()
      if (this.pos >= this.source.length) break
      this.scanToken()
    }
    this.tokens.push({
      type: TokenType.EOF,
      value: '',
      loc: { line: this.line, col: this.col, offset: this.pos, file: this.filename },
    })
    return this.tokens
  }

  // ---- private helpers ----

  private loc() {
    return { line: this.line, col: this.col, offset: this.pos, file: this.filename }
  }

  private peek(offset = 0): string {
    return this.source[this.pos + offset] ?? ''
  }

  private advance(): string {
    const ch = this.source[this.pos++] ?? ''
    if (ch === '\n') {
      this.line++
      this.col = 1
    } else {
      this.col++
    }
    return ch
  }

  private skipWhitespaceAndComments(): void {
    while (this.pos < this.source.length) {
      const ch = this.peek()

      // Whitespace
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
        this.advance()
        continue
      }

      // Line comment: //
      if (ch === '/' && this.peek(1) === '/') {
        while (this.pos < this.source.length && this.peek() !== '\n') {
          this.advance()
        }
        continue
      }

      // Block comment: /* ... */
      if (ch === '/' && this.peek(1) === '*') {
        const startLoc = this.loc()
        this.advance() // /
        this.advance() // *
        let closed = false
        while (this.pos < this.source.length) {
          if (this.peek() === '*' && this.peek(1) === '/') {
            this.advance() // *
            this.advance() // /
            closed = true
            break
          }
          this.advance()
        }
        if (!closed) {
          throw new ParseError([{
            code: 'E001_UNCLOSED_BLOCK_COMMENT',
            message: 'Unclosed block comment',
            hint: 'Add */ to close the block comment',
            loc: startLoc,
          }])
        }
        continue
      }

      break
    }
  }

  private scanToken(): void {
    const ch = this.peek()

    // Single-char punctuation
    const punctuation: Partial<Record<string, TokenType>> = {
      '{': TokenType.LBRACE,
      '}': TokenType.RBRACE,
      '[': TokenType.LBRACKET,
      ']': TokenType.RBRACKET,
      ':': TokenType.COLON,
      ',': TokenType.COMMA,
    }

    const punc = punctuation[ch]
    if (punc !== undefined) {
      const loc = this.loc()
      this.advance()
      this.tokens.push({ type: punc, value: ch, loc })
      return
    }

    // String literal: "..." or '...'
    if (ch === '"' || ch === "'") {
      this.scanString(ch)
      return
    }

    // Number
    if (ch >= '0' && ch <= '9') {
      this.scanNumber()
      return
    }

    // Identifier or keyword (including @src/... paths treated as identifiers)
    if (ch === '_' || (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')) {
      this.scanIdentifierOrKeyword()
      return
    }

    // Unknown character
    throw new ParseError([{
      code: 'E002_UNEXPECTED_CHAR',
      message: `Unexpected character: '${ch}'`,
      hint: 'Check for typos or unsupported syntax in your .vasp file',
      loc: this.loc(),
    }])
  }

  private scanString(quote: string): void {
    const loc = this.loc()
    this.advance() // opening quote
    let value = ''
    while (this.pos < this.source.length && this.peek() !== quote) {
      if (this.peek() === '\n') {
        throw new ParseError([{
          code: 'E003_UNTERMINATED_STRING',
          message: 'Unterminated string literal',
          hint: 'Close the string with a matching quote on the same line',
          loc,
        }])
      }
      if (this.peek() === '\\') {
        this.advance() // backslash
        const escaped = this.advance()
        value += this.unescape(escaped)
      } else {
        value += this.advance()
      }
    }
    if (this.pos >= this.source.length) {
      throw new ParseError([{
        code: 'E003_UNTERMINATED_STRING',
        message: 'Unterminated string literal',
        hint: 'Close the string with a matching quote',
        loc,
      }])
    }
    this.advance() // closing quote
    this.tokens.push({ type: TokenType.STRING, value, loc })
  }

  private unescape(ch: string): string {
    const map: Record<string, string> = { n: '\n', t: '\t', r: '\r', '"': '"', "'": "'", '\\': '\\' }
    return map[ch] ?? ch
  }

  private scanNumber(): void {
    const loc = this.loc()
    let value = ''
    while (this.pos < this.source.length && this.peek() >= '0' && this.peek() <= '9') {
      value += this.advance()
    }
    if (this.peek() === '.' && this.peek(1) >= '0' && this.peek(1) <= '9') {
      value += this.advance() // .
      while (this.pos < this.source.length && this.peek() >= '0' && this.peek() <= '9') {
        value += this.advance()
      }
    }
    this.tokens.push({ type: TokenType.NUMBER, value, loc })
  }

  private scanIdentifierOrKeyword(): void {
    const loc = this.loc()
    let value = ''
    while (this.pos < this.source.length) {
      const c = this.peek()
      // Allow alphanumeric, underscore, hyphen (for kebab-case names)
      if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_' || c === '-') {
        value += this.advance()
      } else {
        break
      }
    }

    // Check if it is a reserved keyword
    if (ALL_KEYWORDS.has(value)) {
      if (BLOCK_KEYWORDS.has(value)) {
        // Map to specific KW_ token type
        this.tokens.push({ type: value as TokenType, value, loc })
      } else if (value === 'import') {
        this.tokens.push({ type: TokenType.KW_IMPORT, value, loc })
      } else if (value === 'from') {
        this.tokens.push({ type: TokenType.KW_FROM, value, loc })
      } else {
        this.tokens.push({ type: TokenType.IDENTIFIER, value, loc })
      }
      return
    }

    // Boolean literals
    if (value === 'true' || value === 'false') {
      this.tokens.push({ type: TokenType.BOOLEAN, value, loc })
      return
    }

    this.tokens.push({ type: TokenType.IDENTIFIER, value, loc })
  }
}
