import type {
  ActionNode,
  AppNode,
  AuthMethod,
  AuthNode,
  CrudNode,
  CrudOperation,
  ImportExpression,
  JobNode,
  PageNode,
  QueryNode,
  RealtimeEvent,
  RealtimeNode,
  RouteNode,
  SourceLocation,
  VaspAST,
} from '@vasp-framework/core'
import { ParseError, SUPPORTED_AUTH_METHODS, SUPPORTED_CRUD_OPERATIONS, SUPPORTED_REALTIME_EVENTS } from '@vasp-framework/core'
import { Lexer } from '../lexer/Lexer.js'
import type { Token } from '../lexer/Token.js'
import { TokenType } from '../lexer/TokenType.js'

export function parse(source: string, filename = 'main.vasp'): VaspAST {
  const tokens = new Lexer(source, filename).tokenize()
  return new Parser(tokens, filename).parse()
}

class Parser {
  private pos = 0

  constructor(
    private readonly tokens: Token[],
    private readonly filename: string,
  ) {}

  // ---- Public ----

  parse(): VaspAST {
    const ast: VaspAST = {
      app: null as unknown as AppNode, // validated by SemanticValidator
      routes: [],
      pages: [],
      queries: [],
      actions: [],
      cruds: [],
      realtimes: [],
      jobs: [],
    }

    while (!this.isEOF()) {
      const kw = this.peek()

      switch (kw.type) {
        case TokenType.KW_APP:
          ast.app = this.parseApp()
          break
        case TokenType.KW_AUTH:
          ast.auth = this.parseAuth()
          break
        case TokenType.KW_ROUTE:
          ast.routes.push(this.parseRoute())
          break
        case TokenType.KW_PAGE:
          ast.pages.push(this.parsePage())
          break
        case TokenType.KW_QUERY:
          ast.queries.push(this.parseQuery())
          break
        case TokenType.KW_ACTION:
          ast.actions.push(this.parseAction())
          break
        case TokenType.KW_CRUD:
          ast.cruds.push(this.parseCrud())
          break
        case TokenType.KW_REALTIME:
          ast.realtimes.push(this.parseRealtime())
          break
        case TokenType.KW_JOB:
          ast.jobs.push(this.parseJob())
          break
        default:
          throw this.error(
            'E010_UNEXPECTED_TOKEN',
            `Unexpected token '${kw.value}' at top level`,
            'Expected a declaration keyword: app, auth, route, page, query, action, crud, realtime, or job',
            kw.loc,
          )
      }
    }

    return ast
  }

  // ---- Block parsers ----

  private parseApp(): AppNode {
    const loc = this.consume(TokenType.KW_APP).loc
    const name = this.consumeIdentifier()
    this.consume(TokenType.LBRACE)

    let title = ''
    let db: 'Drizzle' = 'Drizzle'
    let ssr: boolean | 'ssg' = false
    let typescript = false

    while (!this.check(TokenType.RBRACE)) {
      const key = this.consumeIdentifier()
      this.consume(TokenType.COLON)

      switch (key.value) {
        case 'title':
          title = this.consumeString()
          break
        case 'db':
          db = this.consumeIdentifier().value as 'Drizzle'
          break
        case 'ssr': {
          const val = this.peek()
          if (val.type === TokenType.BOOLEAN) {
            ssr = this.consume(TokenType.BOOLEAN).value === 'true'
          } else if (val.type === TokenType.STRING) {
            const s = this.consumeString()
            if (s !== 'ssg') {
              throw this.error('E011_INVALID_SSR', `Invalid ssr value "${s}"`, 'Use: false, true, or "ssg"', val.loc)
            }
            ssr = 'ssg'
          } else {
            throw this.error('E011_INVALID_SSR', 'Invalid ssr value', 'Use: false, true, or "ssg"', val.loc)
          }
          break
        }
        case 'typescript':
          typescript = this.consume(TokenType.BOOLEAN).value === 'true'
          break
        default:
          throw this.error('E012_UNKNOWN_PROP', `Unknown app property '${key.value}'`, 'Valid properties: title, db, ssr, typescript', key.loc)
      }
    }

    this.consume(TokenType.RBRACE)
    return { type: 'App', name: name.value, loc, title, db, ssr, typescript }
  }

  private parseAuth(): AuthNode {
    const loc = this.consume(TokenType.KW_AUTH).loc
    const name = this.consumeIdentifier()
    this.consume(TokenType.LBRACE)

    let userEntity = ''
    let methods: AuthMethod[] = []

    while (!this.check(TokenType.RBRACE)) {
      const key = this.consumeIdentifier()
      this.consume(TokenType.COLON)

      switch (key.value) {
        case 'userEntity':
          userEntity = this.consumeIdentifier().value
          break
        case 'methods':
          methods = this.parseIdentifierArray() as AuthMethod[]
          break
        default:
          throw this.error('E013_UNKNOWN_PROP', `Unknown auth property '${key.value}'`, 'Valid properties: userEntity, methods', key.loc)
      }
    }

    this.consume(TokenType.RBRACE)
    return { type: 'Auth', name: name.value, loc, userEntity, methods }
  }

  private parseRoute(): RouteNode {
    const loc = this.consume(TokenType.KW_ROUTE).loc
    const name = this.consumeIdentifier()
    this.consume(TokenType.LBRACE)

    let path = ''
    let to = ''

    while (!this.check(TokenType.RBRACE)) {
      const key = this.consumeIdentifier()
      this.consume(TokenType.COLON)

      switch (key.value) {
        case 'path':
          path = this.consumeString()
          break
        case 'to':
          to = this.consumeIdentifier().value
          break
        default:
          throw this.error('E014_UNKNOWN_PROP', `Unknown route property '${key.value}'`, 'Valid properties: path, to', key.loc)
      }
    }

    this.consume(TokenType.RBRACE)
    return { type: 'Route', name: name.value, loc, path, to }
  }

  private parsePage(): PageNode {
    const loc = this.consume(TokenType.KW_PAGE).loc
    const name = this.consumeIdentifier()
    this.consume(TokenType.LBRACE)

    let component: ImportExpression | null = null

    while (!this.check(TokenType.RBRACE)) {
      const key = this.consumeIdentifier()
      this.consume(TokenType.COLON)

      switch (key.value) {
        case 'component':
          component = this.parseImportExpression()
          break
        default:
          throw this.error('E015_UNKNOWN_PROP', `Unknown page property '${key.value}'`, 'Valid properties: component', key.loc)
      }
    }

    this.consume(TokenType.RBRACE)

    if (!component) {
      throw this.error('E016_MISSING_COMPONENT', `Page '${name.value}' is missing a component`, 'Add: component: import Foo from "@src/pages/Foo.vue"', loc)
    }

    return { type: 'Page', name: name.value, loc, component }
  }

  private parseQuery(): QueryNode {
    const loc = this.consume(TokenType.KW_QUERY).loc
    const name = this.consumeIdentifier()
    this.consume(TokenType.LBRACE)

    let fn: ImportExpression | null = null
    let entities: string[] = []
    let auth = false

    while (!this.check(TokenType.RBRACE)) {
      const key = this.consumeIdentifier()
      this.consume(TokenType.COLON)

      switch (key.value) {
        case 'fn':
          fn = this.parseImportExpression()
          break
        case 'entities':
          entities = this.parseIdentifierArray()
          break
        case 'auth':
          auth = this.consume(TokenType.BOOLEAN).value === 'true'
          break
        default:
          throw this.error('E017_UNKNOWN_PROP', `Unknown query property '${key.value}'`, 'Valid properties: fn, entities, auth', key.loc)
      }
    }

    this.consume(TokenType.RBRACE)

    if (!fn) {
      throw this.error('E018_MISSING_FN', `Query '${name.value}' is missing fn`, 'Add: fn: import { myFn } from "@src/queries.js"', loc)
    }

    return { type: 'Query', name: name.value, loc, fn, entities, auth }
  }

  private parseAction(): ActionNode {
    const loc = this.consume(TokenType.KW_ACTION).loc
    const name = this.consumeIdentifier()
    this.consume(TokenType.LBRACE)

    let fn: ImportExpression | null = null
    let entities: string[] = []
    let auth = false

    while (!this.check(TokenType.RBRACE)) {
      const key = this.consumeIdentifier()
      this.consume(TokenType.COLON)

      switch (key.value) {
        case 'fn':
          fn = this.parseImportExpression()
          break
        case 'entities':
          entities = this.parseIdentifierArray()
          break
        case 'auth':
          auth = this.consume(TokenType.BOOLEAN).value === 'true'
          break
        default:
          throw this.error('E019_UNKNOWN_PROP', `Unknown action property '${key.value}'`, 'Valid properties: fn, entities, auth', key.loc)
      }
    }

    this.consume(TokenType.RBRACE)

    if (!fn) {
      throw this.error('E020_MISSING_FN', `Action '${name.value}' is missing fn`, 'Add: fn: import { myFn } from "@src/actions.js"', loc)
    }

    return { type: 'Action', name: name.value, loc, fn, entities, auth }
  }

  private parseCrud(): CrudNode {
    const loc = this.consume(TokenType.KW_CRUD).loc
    const name = this.consumeIdentifier()
    this.consume(TokenType.LBRACE)

    let entity = ''
    let operations: CrudOperation[] = []

    while (!this.check(TokenType.RBRACE)) {
      const key = this.consumeIdentifier()
      this.consume(TokenType.COLON)

      switch (key.value) {
        case 'entity':
          entity = this.consumeIdentifier().value
          break
        case 'operations':
          operations = this.parseIdentifierArray() as CrudOperation[]
          break
        default:
          throw this.error('E021_UNKNOWN_PROP', `Unknown crud property '${key.value}'`, 'Valid properties: entity, operations', key.loc)
      }
    }

    this.consume(TokenType.RBRACE)
    return { type: 'Crud', name: name.value, loc, entity, operations }
  }

  private parseRealtime(): RealtimeNode {
    const loc = this.consume(TokenType.KW_REALTIME).loc
    const name = this.consumeIdentifier()
    this.consume(TokenType.LBRACE)

    let entity = ''
    let events: RealtimeEvent[] = []

    while (!this.check(TokenType.RBRACE)) {
      const key = this.consumeIdentifier()
      this.consume(TokenType.COLON)

      switch (key.value) {
        case 'entity':
          entity = this.consumeIdentifier().value
          break
        case 'events':
          events = this.parseIdentifierArray() as RealtimeEvent[]
          break
        default:
          throw this.error('E022_UNKNOWN_PROP', `Unknown realtime property '${key.value}'`, 'Valid properties: entity, events', key.loc)
      }
    }

    this.consume(TokenType.RBRACE)
    return { type: 'Realtime', name: name.value, loc, entity, events }
  }

  private parseJob(): JobNode {
    const loc = this.consume(TokenType.KW_JOB).loc
    const name = this.consumeIdentifier()
    this.consume(TokenType.LBRACE)

    let executor: 'PgBoss' = 'PgBoss'
    let performFn: ImportExpression | null = null
    let schedule: string | undefined

    while (!this.check(TokenType.RBRACE)) {
      const key = this.consumeIdentifier()
      this.consume(TokenType.COLON)

      switch (key.value) {
        case 'executor':
          executor = this.consumeIdentifier().value as 'PgBoss'
          break
        case 'perform': {
          // Nested block: perform: { fn: import ... }
          this.consume(TokenType.LBRACE)
          while (!this.check(TokenType.RBRACE)) {
            const innerKey = this.consumeIdentifier()
            this.consume(TokenType.COLON)
            if (innerKey.value === 'fn') {
              performFn = this.parseImportExpression()
            } else {
              throw this.error('E023_UNKNOWN_PROP', `Unknown perform property '${innerKey.value}'`, 'Valid properties: fn', innerKey.loc)
            }
          }
          this.consume(TokenType.RBRACE)
          break
        }
        case 'schedule':
          schedule = this.consumeString()
          break
        default:
          throw this.error('E024_UNKNOWN_PROP', `Unknown job property '${key.value}'`, 'Valid properties: executor, perform, schedule', key.loc)
      }
    }

    this.consume(TokenType.RBRACE)

    if (!performFn) {
      throw this.error('E025_MISSING_PERFORM', `Job '${name.value}' is missing perform.fn`, 'Add: perform: { fn: import { myJob } from "@src/jobs.js" }', loc)
    }

    return {
      type: 'Job',
      name: name.value,
      loc,
      executor,
      perform: { fn: performFn },
      ...(schedule !== undefined ? { schedule } : {}),
    }
  }

  // ---- Value parsers ----

  /**
   * Parses both import forms:
   *   import Foo from "@src/..."        → DefaultImportExpression
   *   import { foo } from "@src/..."    → NamedImportExpression
   */
  private parseImportExpression(): ImportExpression {
    const loc = this.consume(TokenType.KW_IMPORT).loc

    // Named import: import { foo } from "..."
    if (this.check(TokenType.LBRACE)) {
      this.consume(TokenType.LBRACE)
      const namedExport = this.consumeIdentifier().value
      this.consume(TokenType.RBRACE)
      this.consume(TokenType.KW_FROM)
      const source = this.consumeString()
      return { kind: 'named', namedExport, source }
    }

    // Default import: import Foo from "..."
    const defaultExport = this.consumeIdentifier().value
    this.consume(TokenType.KW_FROM)
    const source = this.consumeString()
    return { kind: 'default', defaultExport, source }
  }

  /** Parses: [ Foo, Bar, Baz ] */
  private parseIdentifierArray(): string[] {
    this.consume(TokenType.LBRACKET)
    const items: string[] = []

    while (!this.check(TokenType.RBRACKET)) {
      items.push(this.consumeIdentifier().value)
      if (this.check(TokenType.COMMA)) {
        this.consume(TokenType.COMMA)
      }
    }

    this.consume(TokenType.RBRACKET)
    return items
  }

  // ---- Token cursor helpers ----

  private peek(): Token {
    return this.tokens[this.pos] ?? { type: TokenType.EOF, value: '', loc: { line: 0, col: 0, offset: 0 } }
  }

  private check(type: TokenType): boolean {
    return this.peek().type === type
  }

  private isEOF(): boolean {
    return this.check(TokenType.EOF)
  }

  private consume(type: TokenType): Token {
    const tok = this.peek()
    if (tok.type !== type) {
      throw this.error(
        'E030_EXPECTED_TOKEN',
        `Expected '${type}' but got '${tok.value || tok.type}'`,
        `Add the missing '${type}'`,
        tok.loc,
      )
    }
    this.pos++
    return tok
  }

  private consumeIdentifier(): Token {
    const tok = this.peek()
    if (tok.type !== TokenType.IDENTIFIER) {
      throw this.error(
        'E031_EXPECTED_IDENTIFIER',
        `Expected an identifier but got '${tok.value || tok.type}'`,
        'Provide a valid name (letters, digits, underscores)',
        tok.loc,
      )
    }
    this.pos++
    return tok
  }

  private consumeString(): string {
    const tok = this.peek()
    if (tok.type !== TokenType.STRING) {
      throw this.error(
        'E032_EXPECTED_STRING',
        `Expected a string but got '${tok.value || tok.type}'`,
        'Wrap the value in double quotes: "value"',
        tok.loc,
      )
    }
    this.pos++
    return tok.value
  }

  private error(code: string, message: string, hint: string, loc?: SourceLocation): ParseError {
    return new ParseError([{ code, message, hint, ...(loc !== undefined ? { loc } : {}) }])
  }
}
