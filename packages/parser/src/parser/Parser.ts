import type {
  ApiMethod,
  ApiNode,
  ActionNode,
  AppNode,
  AuthMethod,
  AuthNode,
  CrudNode,
  CrudOperation,
  EntityNode,
  EnvRequirement,
  FieldModifier,
  FieldNode,
  ImportExpression,
  JobNode,
  MiddlewareNode,
  MiddlewareScope,
  OnDeleteBehavior,
  PageNode,
  QueryNode,
  RealtimeEvent,
  RealtimeNode,
  RouteNode,
  SeedNode,
  SourceLocation,
  VaspAST,
} from '@vasp-framework/core'
import { ParseError, SUPPORTED_AUTH_METHODS, SUPPORTED_CRUD_OPERATIONS, SUPPORTED_REALTIME_EVENTS } from '@vasp-framework/core'
import type { ParseDiagnostic } from '@vasp-framework/core'
import { Lexer } from '../lexer/Lexer.js'
import type { Token } from '../lexer/Token.js'
import { BLOCK_KEYWORDS, TokenType } from '../lexer/TokenType.js'

export function parse(source: string, filename = 'main.vasp'): VaspAST {
  const tokens = new Lexer(source, filename).tokenize()
  return new Parser(tokens, filename).parse()
}

/** Extract route params from a path string, e.g. "/users/:id" → ["id"] */
function extractRouteParams(path: string): string[] {
  const matches = path.match(/:([^/]+)/g)
  return matches ? matches.map((m) => m.slice(1)) : []
}

class Parser {
  private pos = 0
  private readonly diagnostics: ParseDiagnostic[] = []

  constructor(
    private readonly tokens: Token[],
    private readonly filename: string,
  ) {}

  // ---- Public ----

  parse(): VaspAST {
    const ast: VaspAST = {
      app: null as unknown as AppNode, // validated by SemanticValidator
      entities: [],
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

      try {
        switch (kw.type) {
          case TokenType.KW_APP:
            ast.app = this.parseApp()
            break
          case TokenType.KW_AUTH:
            ast.auth = this.parseAuth()
            break
          case TokenType.KW_ENTITY:
            ast.entities.push(this.parseEntity())
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
          case TokenType.KW_MIDDLEWARE:
            ;(ast.middlewares ??= []).push(this.parseMiddleware())
            break
          case TokenType.KW_API:
            ;(ast.apis ??= []).push(this.parseApi())
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
          case TokenType.KW_SEED:
            if (ast.seed) {
              throw this.error(
                'E040_DUPLICATE_SEED_BLOCK',
                'Duplicate seed block found',
                'Only one seed block is allowed in main.vasp',
                kw.loc,
              )
            }
            ast.seed = this.parseSeed()
            break
          default:
            throw this.error(
              'E010_UNEXPECTED_TOKEN',
              `Unexpected token '${kw.value}' at top level`,
              'Expected a declaration keyword: app, auth, entity, route, page, query, action, api, middleware, crud, realtime, job, or seed',
              kw.loc,
            )
        }
      } catch (err) {
        if (err instanceof ParseError) {
          this.diagnostics.push(...err.diagnostics)
          this.skipToNextBlock()
        } else {
          throw err
        }
      }
    }

    if (this.diagnostics.length > 0) {
      throw new ParseError(this.diagnostics)
    }

    return ast
  }

  /** Skip tokens until we reach the closing `}` of the current block, then resume at the next top-level keyword. */
  private skipToNextBlock(): void {
    let depth = 0
    while (!this.isEOF()) {
      const tok = this.peek()
      if (tok.type === TokenType.LBRACE) {
        depth++
        this.pos++
      } else if (tok.type === TokenType.RBRACE) {
        if (depth <= 1) {
          this.pos++ // consume the closing brace
          return
        }
        depth--
        this.pos++
      } else if (depth === 0 && BLOCK_KEYWORDS.has(tok.type)) {
        // We've hit the next block keyword at top level — stop skipping
        return
      } else {
        this.pos++
      }
    }
  }

  // ---- Block parsers ----

  private parseApp(): AppNode {
    const loc = this.consume(TokenType.KW_APP).loc
    const name = this.consumeIdentifier()
    this.consume(TokenType.LBRACE)

    let title = ''
    let db = 'Drizzle' as const
    let ssr: boolean | 'ssg' = false
    let typescript = false
    let env: Record<string, EnvRequirement> = {}

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
        case 'env': {
          this.consume(TokenType.LBRACE)
          while (!this.check(TokenType.RBRACE)) {
            const envKey = this.consumeIdentifier().value
            this.consume(TokenType.COLON)
            const requirement = this.consumeIdentifier().value as EnvRequirement

            if (requirement !== 'required' && requirement !== 'optional') {
              throw this.error(
                'E038_INVALID_ENV_REQUIREMENT',
                `Invalid env requirement '${requirement}' for '${envKey}'`,
                'Use required or optional',
                this.peek().loc,
              )
            }

            if (envKey in env) {
              throw this.error(
                'E039_DUPLICATE_ENV_KEY',
                `Duplicate env key '${envKey}' in app.env`,
                'Each env key must be declared once',
                this.peek().loc,
              )
            }

            env[envKey] = requirement
            if (this.check(TokenType.COMMA)) this.consume(TokenType.COMMA)
          }
          this.consume(TokenType.RBRACE)
          break
        }
        default:
          throw this.error('E012_UNKNOWN_PROP', `Unknown app property '${key.value}'`, 'Valid properties: title, db, ssr, typescript, env', key.loc)
      }
    }

    this.consume(TokenType.RBRACE)
    return {
      type: 'App',
      name: name.value,
      loc,
      title,
      db,
      ssr,
      typescript,
      ...(Object.keys(env).length > 0 ? { env } : {}),
    }
  }

  private parseAuth(): AuthNode {
    const loc = this.consume(TokenType.KW_AUTH).loc
    const name = this.consumeIdentifier()
    this.consume(TokenType.LBRACE)

    let userEntity = ''
    let methods: AuthMethod[] = []
    let roles: string[] = []

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
        case 'roles':
          roles = this.parseIdentifierArray()
          break
        default:
          throw this.error('E013_UNKNOWN_PROP', `Unknown auth property '${key.value}'`, 'Valid properties: userEntity, methods, roles', key.loc)
      }
    }

    this.consume(TokenType.RBRACE)
    return {
      type: 'Auth',
      name: name.value,
      loc,
      userEntity,
      methods,
      ...(roles.length > 0 ? { roles } : {}),
    }
  }

  private parseEntity(): EntityNode {
    const loc = this.consume(TokenType.KW_ENTITY).loc
    const name = this.consumeIdentifier()
    this.consume(TokenType.LBRACE)

    // Primitive types recognized by the parser — entity names accepted for relations
    const primitiveTypes = new Set(['String', 'Int', 'Boolean', 'DateTime', 'Float', 'Text', 'Json', 'Enum'])

    const fields: FieldNode[] = []

    while (!this.check(TokenType.RBRACE)) {
      const fieldName = this.consumeIdentifier()
      this.consume(TokenType.COLON)
      const fieldTypeToken = this.consumeIdentifier()
      const fieldTypeStr = fieldTypeToken.value

      // Parse Enum variant list: Enum(active, inactive, archived)
      let enumValues: string[] | undefined
      if (fieldTypeStr === 'Enum') {
        this.consume(TokenType.LPAREN)
        enumValues = []
        const seenVariants = new Set<string>()
        while (!this.check(TokenType.RPAREN)) {
          const variant = this.consumeIdentifier()
          if (seenVariants.has(variant.value)) {
            throw this.error('E150_DUPLICATE_ENUM_VARIANT', `Duplicate enum variant '${variant.value}' in field '${fieldName.value}'`, 'Each enum variant must be unique', variant.loc)
          }
          seenVariants.add(variant.value)
          enumValues.push(variant.value)
          if (this.check(TokenType.COMMA)) this.consume(TokenType.COMMA)
        }
        this.consume(TokenType.RPAREN)
        if (enumValues.length === 0) {
          throw this.error('E116_EMPTY_ENUM', `Enum field '${fieldName.value}' must have at least one variant`, 'Example: status: Enum(active, inactive, archived)', fieldTypeToken.loc)
        }
      }

      // Detect [] suffix — marks this as an array relation (virtual, no column)
      let isArray = false
      if (this.check(TokenType.LBRACKET)) {
        this.consume(TokenType.LBRACKET)
        this.consume(TokenType.RBRACKET)
        isArray = true
      }

      const isRelation = !primitiveTypes.has(fieldTypeStr)

      // Parse modifiers (@id, @unique, @default(...), @nullable, @updatedAt, @onDelete(...))
      const modifiers: FieldModifier[] = []
      let nullable = false
      let defaultValue: string | undefined
      let onDelete: OnDeleteBehavior | undefined
      let isUpdatedAt = false

      while (this.check(TokenType.AT_MODIFIER)) {
        const mod = this.consume(TokenType.AT_MODIFIER)
        const modVal = mod.value

        if (modVal === 'id') {
          modifiers.push('id')
        } else if (modVal === 'unique') {
          modifiers.push('unique')
        } else if (modVal === 'default_now') {
          modifiers.push('default_now')
          defaultValue = 'now'
        } else if (modVal === 'nullable') {
          nullable = true
          modifiers.push('nullable')
        } else if (modVal === 'updatedAt') {
          isUpdatedAt = true
          modifiers.push('updatedAt')
        } else if (modVal.startsWith('default_')) {
          defaultValue = modVal.slice('default_'.length)
        } else if (modVal.startsWith('onDelete_')) {
          onDelete = modVal.slice('onDelete_'.length) as OnDeleteBehavior
        }
        // Unknown modifiers are silently ignored (forward-compat)
      }

      const field: FieldNode = {
        name: fieldName.value,
        type: fieldTypeStr,
        modifiers,
        isRelation,
        isArray,
        nullable,
        isUpdatedAt,
      }
      if (isRelation) field.relatedEntity = fieldTypeStr
      if (defaultValue !== undefined) field.defaultValue = defaultValue
      if (onDelete !== undefined) field.onDelete = onDelete
      if (enumValues !== undefined) field.enumValues = enumValues

      fields.push(field)
    }

    this.consume(TokenType.RBRACE)
    return { type: 'Entity', name: name.value, loc, fields }
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
    const params = extractRouteParams(path)
    return { type: 'Route', name: name.value, loc, path, to, params }
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
    let roles: string[] = []

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
        case 'roles':
          roles = this.parseIdentifierArray()
          break
        default:
          throw this.error('E017_UNKNOWN_PROP', `Unknown query property '${key.value}'`, 'Valid properties: fn, entities, auth, roles', key.loc)
      }
    }

    this.consume(TokenType.RBRACE)

    if (!fn) {
      throw this.error('E018_MISSING_FN', `Query '${name.value}' is missing fn`, 'Add: fn: import { myFn } from "@src/queries.js"', loc)
    }

    return { type: 'Query', name: name.value, loc, fn, entities, auth, ...(roles.length > 0 ? { roles } : {}) }
  }

  private parseAction(): ActionNode {
    const loc = this.consume(TokenType.KW_ACTION).loc
    const name = this.consumeIdentifier()
    this.consume(TokenType.LBRACE)

    let fn: ImportExpression | null = null
    let entities: string[] = []
    let auth = false
    let roles: string[] = []

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
        case 'roles':
          roles = this.parseIdentifierArray()
          break
        default:
          throw this.error('E019_UNKNOWN_PROP', `Unknown action property '${key.value}'`, 'Valid properties: fn, entities, auth, roles', key.loc)
      }
    }

    this.consume(TokenType.RBRACE)

    if (!fn) {
      throw this.error('E020_MISSING_FN', `Action '${name.value}' is missing fn`, 'Add: fn: import { myFn } from "@src/actions.js"', loc)
    }

    return { type: 'Action', name: name.value, loc, fn, entities, auth, ...(roles.length > 0 ? { roles } : {}) }
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

  private parseApi(): ApiNode {
    const loc = this.consume(TokenType.KW_API).loc
    const name = this.consumeIdentifier()
    this.consume(TokenType.LBRACE)

    let method = 'GET' as ApiMethod
    let path = ''
    let fn: ImportExpression | null = null
    let auth = false
    let roles: string[] = []

    while (!this.check(TokenType.RBRACE)) {
      const key = this.consumeIdentifier()
      this.consume(TokenType.COLON)

      switch (key.value) {
        case 'method':
          method = this.consumeIdentifier().value.toUpperCase() as ApiMethod
          break
        case 'path':
          path = this.consumeString()
          break
        case 'fn':
          fn = this.parseImportExpression()
          break
        case 'auth':
          auth = this.consume(TokenType.BOOLEAN).value === 'true'
          break
        case 'roles':
          roles = this.parseIdentifierArray()
          break
        default:
          throw this.error('E033_UNKNOWN_PROP', `Unknown api property '${key.value}'`, 'Valid properties: method, path, fn, auth, roles', key.loc)
      }
    }

    this.consume(TokenType.RBRACE)

    if (!fn) {
      throw this.error('E034_MISSING_FN', `Api '${name.value}' is missing fn`, 'Add: fn: import { myHandler } from "@src/api.js"', loc)
    }

    if (!path) {
      throw this.error('E035_MISSING_PATH', `Api '${name.value}' is missing path`, 'Add: path: "/api/my-endpoint"', loc)
    }

    return { type: 'Api', name: name.value, loc, method, path, fn, auth, ...(roles.length > 0 ? { roles } : {}) }
  }

  private parseMiddleware(): MiddlewareNode {
    const loc = this.consume(TokenType.KW_MIDDLEWARE).loc
    const name = this.consumeIdentifier()
    this.consume(TokenType.LBRACE)

    let fn: ImportExpression | null = null
    let scope = 'global' as MiddlewareScope

    while (!this.check(TokenType.RBRACE)) {
      const key = this.consumeIdentifier()
      this.consume(TokenType.COLON)

      switch (key.value) {
        case 'fn':
          fn = this.parseImportExpression()
          break
        case 'scope':
          scope = this.consumeIdentifier().value as MiddlewareScope
          break
        default:
          throw this.error('E036_UNKNOWN_PROP', `Unknown middleware property '${key.value}'`, 'Valid properties: fn, scope', key.loc)
      }
    }

    this.consume(TokenType.RBRACE)

    if (!fn) {
      throw this.error('E037_MISSING_FN', `Middleware '${name.value}' is missing fn`, 'Add: fn: import logger from "@src/middleware/logger.js"', loc)
    }

    return { type: 'Middleware', name: name.value, loc, fn, scope }
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

    let executor = 'PgBoss' as const
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

  private parseSeed(): SeedNode {
    const loc = this.consume(TokenType.KW_SEED).loc
    this.consume(TokenType.LBRACE)

    let fn: ImportExpression | null = null

    while (!this.check(TokenType.RBRACE)) {
      const key = this.consumeIdentifier()
      this.consume(TokenType.COLON)

      switch (key.value) {
        case 'fn':
          fn = this.parseImportExpression()
          break
        default:
          throw this.error('E041_UNKNOWN_PROP', `Unknown seed property '${key.value}'`, 'Valid properties: fn', key.loc)
      }
    }

    this.consume(TokenType.RBRACE)

    if (!fn) {
      throw this.error('E042_MISSING_FN', 'Seed block is missing fn', 'Add: fn: import seedData from "@src/seed.js"', loc)
    }

    return { type: 'Seed', fn, loc }
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
    // Accept IDENTIFIER tokens and also block keywords (like 'entity')
    // when they appear in property-name or value position
    if (tok.type !== TokenType.IDENTIFIER && !BLOCK_KEYWORDS.has(tok.type)) {
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
