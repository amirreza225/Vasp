import { describe, expect, it } from 'vitest'
import { Lexer } from './Lexer.js'
import { TokenType } from './TokenType.js'

function lex(source: string) {
  return new Lexer(source).tokenize()
}

function types(source: string) {
  return lex(source).map((t) => t.type)
}

describe('Lexer', () => {
  it('tokenizes empty input', () => {
    expect(types('')).toEqual([TokenType.EOF])
  })

  it('tokenizes single-char punctuation', () => {
    expect(types('{ } [ ] : ,')).toEqual([
      TokenType.LBRACE,
      TokenType.RBRACE,
      TokenType.LBRACKET,
      TokenType.RBRACKET,
      TokenType.COLON,
      TokenType.COMMA,
      TokenType.EOF,
    ])
  })

  it('tokenizes block keywords', () => {
    const keywords = ['app', 'auth', 'route', 'page', 'query', 'action', 'api', 'middleware', 'crud', 'realtime', 'job', 'seed']
    for (const kw of keywords) {
      const tokens = lex(kw)
      expect(tokens[0]?.type).toBe(kw)
    }
  })

  it('tokenizes import/from keywords', () => {
    expect(types('import from')).toEqual([
      TokenType.KW_IMPORT,
      TokenType.KW_FROM,
      TokenType.EOF,
    ])
  })

  it('tokenizes boolean literals', () => {
    const tokens = lex('true false')
    expect(tokens[0]).toMatchObject({ type: TokenType.BOOLEAN, value: 'true' })
    expect(tokens[1]).toMatchObject({ type: TokenType.BOOLEAN, value: 'false' })
  })

  it('tokenizes double-quoted strings', () => {
    const tokens = lex('"hello world"')
    expect(tokens[0]).toMatchObject({ type: TokenType.STRING, value: 'hello world' })
  })

  it('tokenizes single-quoted strings', () => {
    const tokens = lex("'Vasp Todo'")
    expect(tokens[0]).toMatchObject({ type: TokenType.STRING, value: 'Vasp Todo' })
  })

  it('tokenizes strings with escape sequences', () => {
    const tokens = lex('"line1\\nline2"')
    expect(tokens[0]).toMatchObject({ type: TokenType.STRING, value: 'line1\nline2' })
  })

  it('tokenizes identifiers', () => {
    const tokens = lex('MyApp getTodos')
    expect(tokens[0]).toMatchObject({ type: TokenType.IDENTIFIER, value: 'MyApp' })
    expect(tokens[1]).toMatchObject({ type: TokenType.IDENTIFIER, value: 'getTodos' })
  })

  it('tokenizes identifiers with hyphens', () => {
    const tokens = lex('my-app')
    expect(tokens[0]).toMatchObject({ type: TokenType.IDENTIFIER, value: 'my-app' })
  })

  it('tokenizes numbers', () => {
    const tokens = lex('42 3.14')
    expect(tokens[0]).toMatchObject({ type: TokenType.NUMBER, value: '42' })
    expect(tokens[1]).toMatchObject({ type: TokenType.NUMBER, value: '3.14' })
  })

  it('strips line comments', () => {
    expect(types('// this is a comment\ntrue')).toEqual([TokenType.BOOLEAN, TokenType.EOF])
  })

  it('strips block comments', () => {
    expect(types('/* block comment */ true')).toEqual([TokenType.BOOLEAN, TokenType.EOF])
  })

  it('tracks line and column numbers', () => {
    const tokens = lex('app\nMyApp')
    expect(tokens[0]?.loc).toMatchObject({ line: 1, col: 1 })
    expect(tokens[1]?.loc).toMatchObject({ line: 2, col: 1 })
  })

  it('throws on unterminated string', () => {
    expect(() => lex('"unclosed')).toThrow('Unterminated string literal')
  })

  it('throws on unclosed block comment', () => {
    expect(() => lex('/* unclosed')).toThrow('Unclosed block comment')
  })

  it('throws on unexpected character', () => {
    expect(() => lex('$bad')).toThrow('Unexpected character')
  })

  it('tokenizes a minimal .vasp block', () => {
    const src = `app MinimalApp {
  title: "Hello"
  ssr: false
}`
    const toks = lex(src)
    const typeList = toks.map((t) => t.type)
    expect(typeList).toEqual([
      TokenType.KW_APP,
      TokenType.IDENTIFIER, // MinimalApp
      TokenType.LBRACE,
      TokenType.IDENTIFIER, // title
      TokenType.COLON,
      TokenType.STRING,     // "Hello"
      TokenType.IDENTIFIER, // ssr
      TokenType.COLON,
      TokenType.BOOLEAN,    // false
      TokenType.RBRACE,
      TokenType.EOF,
    ])
  })

  it('tokenizes an import expression', () => {
    const src = `import Home from "@src/pages/Home.vue"`
    const toks = lex(src)
    expect(toks[0]?.type).toBe(TokenType.KW_IMPORT)
    expect(toks[1]?.type).toBe(TokenType.IDENTIFIER) // Home
    expect(toks[2]?.type).toBe(TokenType.KW_FROM)
    expect(toks[3]?.type).toBe(TokenType.STRING)
    expect(toks[3]?.value).toBe('@src/pages/Home.vue')
  })

  it('tokenizes a named import expression', () => {
    const src = `import { getTodos } from "@src/queries.js"`
    const toks = lex(src)
    expect(toks[0]?.type).toBe(TokenType.KW_IMPORT)
    expect(toks[1]?.type).toBe(TokenType.LBRACE)
    expect(toks[2]?.type).toBe(TokenType.IDENTIFIER) // getTodos
    expect(toks[3]?.type).toBe(TokenType.RBRACE)
    expect(toks[4]?.type).toBe(TokenType.KW_FROM)
    expect(toks[5]?.type).toBe(TokenType.STRING)
  })

  it('tokenizes entity keyword', () => {
    const tokens = lex('entity')
    expect(tokens[0]?.type).toBe(TokenType.KW_ENTITY)
  })

  it('tokenizes @ modifiers', () => {
    const tokens = lex('@id @unique @default(now)')
    expect(tokens[0]).toMatchObject({ type: TokenType.AT_MODIFIER, value: 'id' })
    expect(tokens[1]).toMatchObject({ type: TokenType.AT_MODIFIER, value: 'unique' })
    expect(tokens[2]).toMatchObject({ type: TokenType.AT_MODIFIER, value: 'default_now' })
  })

  it('throws on unclosed modifier argument', () => {
    expect(() => lex('@default(now')).toThrow("Unclosed '(' in @default modifier")
  })

  it('throws on unclosed modifier argument with correct location', () => {
    const src = 'entity Foo {\n  id: Int @id\n  name: String @default(now\n}'
    try {
      lex(src)
      expect.unreachable('should have thrown')
    } catch (e: any) {
      const diag = e.diagnostics?.[0]
      expect(diag.code).toBe('E004_UNCLOSED_MODIFIER_ARG')
      // Location should point at the opening '(' on line 3, not EOF
      expect(diag.loc.line).toBe(3)
    }
  })

  it('tokenizes an entity block', () => {
    const src = `entity Todo {
  id: Int @id
  title: String
  done: Boolean
}`
    const toks = lex(src)
    const typeList = toks.map((t) => t.type)
    expect(typeList).toEqual([
      TokenType.KW_ENTITY,
      TokenType.IDENTIFIER, // Todo
      TokenType.LBRACE,
      TokenType.IDENTIFIER, // id
      TokenType.COLON,
      TokenType.IDENTIFIER, // Int
      TokenType.AT_MODIFIER, // @id
      TokenType.IDENTIFIER, // title
      TokenType.COLON,
      TokenType.IDENTIFIER, // String
      TokenType.IDENTIFIER, // done
      TokenType.COLON,
      TokenType.IDENTIFIER, // Boolean
      TokenType.RBRACE,
      TokenType.EOF,
    ])
  })
})
