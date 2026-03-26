import { describe, expect, it } from 'vitest'
import { toCamelCase, toKebabCase, toPascalCase, TemplateEngine } from './TemplateEngine.js'

describe('TemplateEngine helpers', () => {
  const engine = new TemplateEngine()

  it('camelCase', () => {
    expect(engine.renderString('{{camelCase name}}', { name: 'get-todos' })).toBe('getTodos')
    expect(engine.renderString('{{camelCase name}}', { name: 'MyTodoApp' })).toBe('myTodoApp')
  })

  it('pascalCase', () => {
    expect(engine.renderString('{{pascalCase name}}', { name: 'get-todos' })).toBe('GetTodos')
    expect(engine.renderString('{{pascalCase name}}', { name: 'myApp' })).toBe('MyApp')
  })

  it('kebabCase', () => {
    expect(engine.renderString('{{kebabCase name}}', { name: 'MyTodoApp' })).toBe('my-todo-app')
    expect(engine.renderString('{{kebabCase name}}', { name: 'getTodos' })).toBe('get-todos')
  })

  it('join', () => {
    expect(engine.renderString('{{join arr ", "}}', { arr: ['a', 'b', 'c'] })).toBe('a, b, c')
    expect(engine.renderString('{{join arr " | "}}', { arr: ['x'] })).toBe('x')
  })

  it('importPath rewrites .js to .ts when ext is ts', () => {
    expect(engine.renderString('{{importPath src ext}}', { src: '@src/queries.js', ext: 'ts' })).toBe('@src/queries.ts')
    expect(engine.renderString('{{importPath src ext}}', { src: '@src/queries.js', ext: 'js' })).toBe('@src/queries.js')
    expect(engine.renderString('{{importPath src ext}}', { src: '@src/pages/Home.vue', ext: 'ts' })).toBe('@src/pages/Home.vue')
  })

  it('eq helper', () => {
    expect(engine.renderString('{{#if (eq a b)}}yes{{else}}no{{/if}}', { a: 'x', b: 'x' })).toBe('yes')
    expect(engine.renderString('{{#if (eq a b)}}yes{{else}}no{{/if}}', { a: 'x', b: 'y' })).toBe('no')
  })

  it('includes helper', () => {
    expect(engine.renderString('{{#if (includes arr item)}}yes{{else}}no{{/if}}', { arr: ['a', 'b'], item: 'b' })).toBe('yes')
    expect(engine.renderString('{{#if (includes arr item)}}yes{{else}}no{{/if}}', { arr: ['a', 'b'], item: 'c' })).toBe('no')
  })

  it('renders basic template', () => {
    const result = engine.renderString('Hello {{name}}!', { name: 'Vasp' })
    expect(result).toBe('Hello Vasp!')
  })

  it('throws GeneratorError for unknown template key', () => {
    expect(() => engine.render('nonexistent.hbs', {})).toThrow('Template not found')
  })
})

describe('TemplateEngine — drizzleColumn helper (Phase 2)', () => {
  const engine = new TemplateEngine()
  const render = (name: string, type: string, modifiers: string[], nullable?: boolean, defaultValue?: string, isUpdatedAt?: boolean) =>
    engine.renderString('{{{drizzleColumn name type modifiers nullable defaultValue isUpdatedAt}}}', { name, type, modifiers, nullable, defaultValue, isUpdatedAt })

  it('maps String to text()', () => {
    expect(render('title', 'String', [])).toContain('text(')
  })

  it('maps Text to text()', () => {
    expect(render('body', 'Text', [])).toContain('text(')
  })

  it('maps Json to jsonb()', () => {
    expect(render('meta', 'Json', [])).toContain('jsonb(')
  })

  it('maps Int to integer() for non-PK fields', () => {
    expect(render('count', 'Int', [])).toContain('integer(')
  })

  it('maps Int @id to identity column for auto-increment PK', () => {
    const col = render('id', 'Int', ['id'])
    expect(col).toContain('integer(')
    expect(col).toContain('.generatedByDefaultAsIdentity()')
  })

  it('maps DateTime to timestamp()', () => {
    expect(render('createdAt', 'DateTime', [])).toContain('timestamp(')
  })

  it('maps Float to doublePrecision()', () => {
    expect(render('price', 'Float', [])).toContain('doublePrecision(')
  })

  it('adds .primaryKey() when modifiers include "id"', () => {
    const col = render('id', 'Int', ['id'])
    expect(col).toContain('integer(')
    expect(col).toContain('.primaryKey()')
    expect(col).toContain('.generatedByDefaultAsIdentity()')
  })

  it('adds .notNull() for non-PK by default', () => {
    const col = render('title', 'String', [])
    expect(col).toContain('.notNull()')
    expect(col).not.toContain('.primaryKey()')
  })

  it('omits .notNull() when nullable=true', () => {
    const col = render('body', 'Text', [], true)
    expect(col).not.toContain('.notNull()')
  })

  it('omits .notNull() when modifiers include "nullable"', () => {
    const col = render('body', 'Text', ['nullable'])
    expect(col).not.toContain('.notNull()')
  })

  it('adds .defaultNow() for @default(now)', () => {
    const col = render('createdAt', 'DateTime', ['default_now'], false, 'now')
    expect(col).toContain('.defaultNow()')
  })

  it('adds .default() with quoted value for string type', () => {
    const col = render('status', 'String', [], false, 'draft')
    expect(col).toContain(".default('draft')")
  })

  it('adds .$onUpdate() when isUpdatedAt=true', () => {
    const col = render('updatedAt', 'DateTime', [], false, undefined, true)
    expect(col).toContain('.$onUpdate(() => new Date())')
  })
})

describe('TemplateEngine — tsFieldType helper (Phase 3)', () => {
  const engine = new TemplateEngine()
  const render = (type: string) =>
    engine.renderString('{{tsFieldType type}}', { type })

  it('maps String to string', () => {
    expect(render('String')).toBe('string')
  })

  it('maps Text to string', () => {
    expect(render('Text')).toBe('string')
  })

  it('maps Int to number', () => {
    expect(render('Int')).toBe('number')
  })

  it('maps Float to number', () => {
    expect(render('Float')).toBe('number')
  })

  it('maps Boolean to boolean', () => {
    expect(render('Boolean')).toBe('boolean')
  })

  it('maps DateTime to Date', () => {
    expect(render('DateTime')).toBe('Date')
  })

  it('maps Json to unknown', () => {
    expect(render('Json')).toBe('unknown')
  })

  it('passes through entity names (unknown types)', () => {
    expect(render('User')).toBe('User')
    expect(render('Todo')).toBe('Todo')
  })
})

describe('TemplateEngine — valibotSchema helper (Phase 4)', () => {
  const engine = new TemplateEngine()
  const render = (type: string, nullable?: boolean, optional?: boolean | string) =>
    engine.renderString('{{{valibotSchema type nullable optional}}}', { type, nullable, optional })

  it('maps String/Text to required non-empty string', () => {
    expect(render('String')).toBe('v.pipe(v.string(), v.minLength(1))')
    expect(render('Text')).toBe('v.pipe(v.string(), v.minLength(1))')
  })

  it('maps numeric types to number', () => {
    expect(render('Int')).toBe('v.number()')
    expect(render('Float')).toBe('v.number()')
  })

  it('maps DateTime to validated pipe+transform and Json to unknown', () => {
    const validDate = `v.pipe(v.string(), v.minLength(1), v.transform(s => new Date(s)), v.check(d => !isNaN(d.getTime()), 'Invalid date'))`
    expect(render('DateTime')).toBe(validDate)
    expect(render('Json')).toBe('v.unknown()')
  })

  it('wraps nullable DateTime in v.union([v.null(), ...])', () => {
    const validDate = `v.pipe(v.string(), v.minLength(1), v.transform(s => new Date(s)), v.check(d => !isNaN(d.getTime()), 'Invalid date'))`
    expect(render('DateTime', true)).toBe(`v.union([v.null(), ${validDate}])`)
  })

  it('wraps nullable + optional DateTime with v.optional(v.union(...))', () => {
    const validDate = `v.pipe(v.string(), v.minLength(1), v.transform(s => new Date(s)), v.check(d => !isNaN(d.getTime()), 'Invalid date'))`
    expect(render('DateTime', true, true)).toBe(`v.optional(v.union([v.null(), ${validDate}]))`)
  })

  it('wraps nullable fields with v.nullable', () => {
    expect(render('String', true)).toBe('v.nullable(v.pipe(v.string(), v.minLength(1)))')
  })

  it('wraps optional fields with v.optional', () => {
    expect(render('Int', false, true)).toBe('v.optional(v.number())')
  })

  it('wraps nullable + optional fields with both wrappers', () => {
    expect(render('Boolean', true, true)).toBe('v.optional(v.nullable(v.boolean()))')
  })
})

describe('String transform utils', () => {
  it('toCamelCase', () => {
    expect(toCamelCase('hello-world')).toBe('helloWorld')
    expect(toCamelCase('MyTodo')).toBe('myTodo')
    expect(toCamelCase('get_todos')).toBe('getTodos')
  })

  it('toPascalCase', () => {
    expect(toPascalCase('hello-world')).toBe('HelloWorld')
    expect(toPascalCase('getTodos')).toBe('GetTodos')
  })

  it('toKebabCase', () => {
    expect(toKebabCase('MyTodoApp')).toBe('my-todo-app')
    expect(toKebabCase('getTodos')).toBe('get-todos')
  })
})

describe('TemplateEngine — valibotSchema helper with validation rules', () => {
  const engine = new TemplateEngine()
  const render = (type: string, nullable?: boolean, optional?: boolean, enumValues?: unknown, validation?: unknown) =>
    engine.renderString('{{{valibotSchema type nullable optional enumValues validation}}}', { type, nullable, optional, enumValues, validation })

  it('generates v.email() when email validation is set', () => {
    const result = render('String', false, false, undefined, { email: true })
    expect(result).toContain('v.email()')
    expect(result).toContain('v.pipe(')
  })

  it('generates v.url() when url validation is set', () => {
    const result = render('String', false, false, undefined, { url: true })
    expect(result).toContain('v.url()')
  })

  it('generates v.uuid() when uuid validation is set', () => {
    const result = render('String', false, false, undefined, { uuid: true })
    expect(result).toContain('v.uuid()')
  })

  it('generates v.minLength(3) when minLength is set', () => {
    const result = render('String', false, false, undefined, { minLength: 3 })
    expect(result).toContain('v.minLength(3)')
  })

  it('generates v.maxLength(30) when maxLength is set', () => {
    const result = render('String', false, false, undefined, { maxLength: 30 })
    expect(result).toContain('v.maxLength(30)')
  })

  it('generates both minLength and maxLength when both are set', () => {
    const result = render('String', false, false, undefined, { minLength: 3, maxLength: 30 })
    expect(result).toContain('v.minLength(3)')
    expect(result).toContain('v.maxLength(30)')
  })

  it('generates v.minValue(0) for Int with min validation', () => {
    const result = render('Int', false, false, undefined, { min: 0 })
    expect(result).toContain('v.minValue(0)')
  })

  it('generates v.maxValue(100) for Int with max validation', () => {
    const result = render('Int', false, false, undefined, { max: 100 })
    expect(result).toContain('v.maxValue(100)')
  })

  it('generates pipe with both min and max for Int', () => {
    const result = render('Int', false, false, undefined, { min: 0, max: 100 })
    expect(result).toBe('v.pipe(v.number(), v.minValue(0), v.maxValue(100))')
  })

  it('wraps in v.nullable when nullable=true and email validation set', () => {
    const result = render('String', true, false, undefined, { email: true })
    expect(result).toContain('v.nullable(')
    expect(result).toContain('v.email()')
  })

  it('generates plain v.pipe(v.string(), v.minLength(1)) for String without validation (backward compat)', () => {
    const result = render('String', false, false, undefined, undefined)
    expect(result).toBe('v.pipe(v.string(), v.minLength(1))')
  })

  it('generates v.string() without minLength(1) for nullable String without validation', () => {
    const result = render('String', true, false, undefined, undefined)
    expect(result).toBe('v.nullable(v.string())')
  })

  it('overrides default minLength(1) when explicit minLength: 0 is given', () => {
    const result = render('String', false, false, undefined, { minLength: 0 })
    expect(result).toContain('v.minLength(0)')
    expect(result).not.toMatch(/v\.minLength\(1\)/)
  })
})
