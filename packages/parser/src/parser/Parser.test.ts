import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from './Parser.js'

const FIXTURES_DIR = join(import.meta.dirname, '../../../../e2e/fixtures')

describe('Parser — minimal app', () => {
  it('parses app block', () => {
    const ast = parse(`
      app MinimalApp {
        title: "Hello Vasp"
        db: Drizzle
        ssr: false
        typescript: false
      }
    `)
    expect(ast.app).toMatchObject({
      type: 'App',
      name: 'MinimalApp',
      title: 'Hello Vasp',
      db: 'Drizzle',
      ssr: false,
      typescript: false,
    })
  })

  it('parses ssr: true', () => {
    const ast = parse(`app A { title: "T" db: Drizzle ssr: true typescript: false }`)
    expect(ast.app.ssr).toBe(true)
  })

  it('parses ssr: "ssg"', () => {
    const ast = parse(`app A { title: "T" db: Drizzle ssr: "ssg" typescript: false }`)
    expect(ast.app.ssr).toBe('ssg')
  })

  it('parses typescript: true', () => {
    const ast = parse(`app A { title: "T" db: Drizzle ssr: false typescript: true }`)
    expect(ast.app.typescript).toBe(true)
  })

  it('parses app env schema', () => {
    const ast = parse(`
      app A {
        title: "T"
        db: Drizzle
        ssr: false
        typescript: false
        env: {
          DATABASE_URL: required
          GOOGLE_CLIENT_ID: optional
        }
      }
    `)

    expect(ast.app.env).toEqual({
      DATABASE_URL: 'required',
      GOOGLE_CLIENT_ID: 'optional',
    })
  })

  it('throws on invalid app env requirement', () => {
    expect(() => parse(`
      app A {
        title: "T"
        db: Drizzle
        ssr: false
        typescript: false
        env: {
          DATABASE_URL: mandatory
        }
      }
    `)).toThrow('E038_INVALID_ENV_REQUIREMENT')
  })

  it('throws on duplicate app env keys', () => {
    expect(() => parse(`
      app A {
        title: "T"
        db: Drizzle
        ssr: false
        typescript: false
        env: {
          DATABASE_URL: required
          DATABASE_URL: optional
        }
      }
    `)).toThrow('E039_DUPLICATE_ENV_KEY')
  })
})

describe('Parser — auth block', () => {
  it('parses auth with all methods', () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      auth User {
        userEntity: User
        methods: [ usernameAndPassword, google, github ]
      }
    `)
    expect(ast.auth).toMatchObject({
      type: 'Auth',
      name: 'User',
      userEntity: 'User',
      methods: ['usernameAndPassword', 'google', 'github'],
    })
  })

  it('parses auth roles', () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      auth User {
        userEntity: User
        methods: [ usernameAndPassword ]
        roles: [ admin, editor, viewer ]
      }
    `)
    expect(ast.auth).toMatchObject({
      roles: ['admin', 'editor', 'viewer'],
    })
  })
})

describe('Parser — entity block', () => {
  it('parses entity with fields and modifiers', () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity Todo {
        id: Int @id
        title: String
        done: Boolean
        createdAt: DateTime @default(now)
      }
    `)
    expect(ast.entities).toHaveLength(1)
    expect(ast.entities[0]).toMatchObject({
      type: 'Entity',
      name: 'Todo',
      fields: [
        { name: 'id', type: 'Int', modifiers: ['id'] },
        { name: 'title', type: 'String', modifiers: [] },
        { name: 'done', type: 'Boolean', modifiers: [] },
        { name: 'createdAt', type: 'DateTime', modifiers: ['default_now'] },
      ],
    })
  })

  it('parses entity with unique modifier', () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity User {
        id: Int @id
        email: String @unique
      }
    `)
    expect(ast.entities[0]?.fields[1]).toMatchObject({
      name: 'email',
      type: 'String',
      modifiers: ['unique'],
    })
  })

  it('parses multiple entities', () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity Todo { id: Int @id title: String }
      entity User { id: Int @id email: String @unique }
    `)
    expect(ast.entities).toHaveLength(2)
    expect(ast.entities[0]?.name).toBe('Todo')
    expect(ast.entities[1]?.name).toBe('User')
  })

  it('treats capitalised field types as relation references (no parser throw)', () => {
    // Unknown capitalized names (e.g. Uuid) are treated as relation entity references.
    // Semantic validation (E115) catches undefined relation entities — not the parser.
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity Todo { id: Uuid @id }
    `)
    const idField = ast.entities[0]?.fields[0]
    expect(idField?.type).toBe('Uuid')
    expect(idField?.isRelation).toBe(true)
  })

  it('parses entity with Float field', () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity Product { id: Int @id price: Float }
    `)
    expect(ast.entities[0]?.fields[1]).toMatchObject({ name: 'price', type: 'Float', modifiers: [] })
  })
})

describe('Parser — route and page', () => {
  it('parses route and page', () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route HomeRoute { path: "/" to: HomePage }
      page HomePage { component: import Home from "@src/pages/Home.vue" }
    `)
    expect(ast.routes[0]).toMatchObject({ type: 'Route', name: 'HomeRoute', path: '/', to: 'HomePage' })
    expect(ast.pages[0]).toMatchObject({
      type: 'Page',
      name: 'HomePage',
      component: { kind: 'default', defaultExport: 'Home', source: '@src/pages/Home.vue' },
    })
  })
})

describe('Parser — query and action', () => {
  it('parses query with named import', () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      crud Todo { entity: Todo operations: [list] }
      query getTodos {
        fn: import { getTodos } from "@src/queries.js"
        entities: [Todo]
      }
    `)
    expect(ast.queries[0]).toMatchObject({
      type: 'Query',
      name: 'getTodos',
      fn: { kind: 'named', namedExport: 'getTodos', source: '@src/queries.js' },
      entities: ['Todo'],
      auth: false,
    })
  })

  it('parses action', () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      crud Todo { entity: Todo operations: [create] }
      action createTodo {
        fn: import { createTodo } from "@src/actions.js"
        entities: [Todo]
      }
    `)
    expect(ast.actions[0]).toMatchObject({
      type: 'Action',
      name: 'createTodo',
      fn: { kind: 'named', namedExport: 'createTodo', source: '@src/actions.js' },
    })
  })

  it('parses roles on query/action', () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      crud Todo { entity: Todo operations: [list, create] }

      query getTodos {
        fn: import { getTodos } from "@src/queries.js"
        entities: [Todo]
        auth: true
        roles: [admin, editor]
      }

      action createTodo {
        fn: import { createTodo } from "@src/actions.js"
        entities: [Todo]
        auth: true
        roles: [admin]
      }
    `)

    expect(ast.queries[0]?.roles).toEqual(['admin', 'editor'])
    expect(ast.actions[0]?.roles).toEqual(['admin'])
  })
})

describe('Parser — api', () => {
  it('parses api with method/path/fn/auth', () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      api uploadRecipeImage {
        method: POST
        path: "/api/recipes/:id/image"
        fn: import { uploadRecipeImage } from "@src/api.js"
        auth: true
      }
    `)

    expect(ast.apis).toHaveLength(1)
    expect(ast.apis?.[0]).toMatchObject({
      type: 'Api',
      name: 'uploadRecipeImage',
      method: 'POST',
      path: '/api/recipes/:id/image',
      auth: true,
      fn: {
        kind: 'named',
        namedExport: 'uploadRecipeImage',
        source: '@src/api.js',
      },
    })
  })

  it('parses api roles', () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      api uploadRecipeImage {
        method: POST
        path: "/api/recipes/:id/image"
        fn: import { uploadRecipeImage } from "@src/api.js"
        auth: true
        roles: [admin]
      }
    `)

    expect(ast.apis?.[0]?.roles).toEqual(['admin'])
  })
})

describe('Parser — middleware', () => {
  it('parses middleware with fn and scope', () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      middleware Logger {
        fn: import logger from "@src/middleware/logger.js"
        scope: global
      }
    `)

    expect(ast.middlewares).toHaveLength(1)
    expect(ast.middlewares?.[0]).toMatchObject({
      type: 'Middleware',
      name: 'Logger',
      scope: 'global',
      fn: {
        kind: 'default',
        defaultExport: 'logger',
        source: '@src/middleware/logger.js',
      },
    })
  })
})

describe('Parser — crud', () => {
  it('parses crud with all operations', () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      crud Todo {
        entity: Todo
        operations: [list, create, update, delete]
      }
    `)
    expect(ast.cruds[0]).toMatchObject({
      type: 'Crud',
      name: 'Todo',
      entity: 'Todo',
      operations: ['list', 'create', 'update', 'delete'],
    })
  })
})

describe('Parser — realtime', () => {
  it('parses realtime block', () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      crud Todo { entity: Todo operations: [list] }
      realtime TodoChannel {
        entity: Todo
        events: [created, updated, deleted]
      }
    `)
    expect(ast.realtimes[0]).toMatchObject({
      type: 'Realtime',
      name: 'TodoChannel',
      entity: 'Todo',
      events: ['created', 'updated', 'deleted'],
    })
  })
})

describe('Parser — job', () => {
  it('parses job with nested perform block', () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      job sendWelcomeEmail {
        executor: PgBoss
        perform: {
          fn: import { sendWelcomeEmail } from "@src/jobs.js"
        }
      }
    `)
    expect(ast.jobs[0]).toMatchObject({
      type: 'Job',
      name: 'sendWelcomeEmail',
      executor: 'PgBoss',
      perform: {
        fn: { kind: 'named', namedExport: 'sendWelcomeEmail', source: '@src/jobs.js' },
      },
    })
  })
})

describe('Parser — seed', () => {
  it('parses seed block', () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      seed {
        fn: import seedData from "@src/seed.js"
      }
    `)

    expect(ast.seed).toMatchObject({
      type: 'Seed',
      fn: {
        kind: 'default',
        defaultExport: 'seedData',
        source: '@src/seed.js',
      },
    })
  })
})

describe('Parser — error cases', () => {
  it('throws on unknown top-level token', () => {
    expect(() => parse('unknown Foo {}')).toThrow('E010_UNEXPECTED_TOKEN')
  })

  it('throws when api fn is missing', () => {
    expect(() => parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      api Upload {
        method: POST
        path: "/api/upload"
      }
    `)).toThrow('E034_MISSING_FN')
  })

  it('throws when middleware fn is missing', () => {
    expect(() => parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      middleware Logger { scope: global }
    `)).toThrow('E037_MISSING_FN')
  })

  it('throws when seed fn is missing', () => {
    expect(() => parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      seed {}
    `)).toThrow('E042_MISSING_FN')
  })

  it('throws on duplicate seed blocks', () => {
    expect(() => parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      seed { fn: import seedData from "@src/seed.js" }
      seed { fn: import otherSeed from "@src/seed2.js" }
    `)).toThrow('E040_DUPLICATE_SEED_BLOCK')
  })

  it('throws on missing component in page', () => {
    expect(() => parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      page HomePage {}
    `)).toThrow('E016_MISSING_COMPONENT')
  })

  it('throws on missing fn in query', () => {
    expect(() => parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      query getTodos { entities: [Todo] }
    `)).toThrow('E018_MISSING_FN')
  })

  it('preserves line numbers in errors', () => {
    try {
      parse('$bad')
    } catch (e: unknown) {
      expect((e as Error).message).toContain('line 1')
    }
  })
})

describe('Parser — relation fields (Phase 2)', () => {
  it('parses a many-to-one relation field', () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity User { id: Int @id }
      entity Todo { id: Int @id author: User }
    `)
    const authorField = ast.entities[1]?.fields[1]
    expect(authorField).toMatchObject({
      name: 'author',
      type: 'User',
      isRelation: true,
      relatedEntity: 'User',
      isArray: false,
      nullable: false,
    })
  })

  it('parses a one-to-many virtual array relation field', () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity User { id: Int @id todos: Todo[] }
      entity Todo { id: Int @id }
    `)
    const todosField = ast.entities[0]?.fields[1]
    expect(todosField).toMatchObject({
      name: 'todos',
      type: 'Todo',
      isRelation: true,
      relatedEntity: 'Todo',
      isArray: true,
    })
  })

  it('parses @onDelete(cascade) modifier on a relation field', () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity User { id: Int @id }
      entity Todo { id: Int @id author: User @onDelete(cascade) }
    `)
    const authorField = ast.entities[1]?.fields[1]
    expect(authorField).toMatchObject({
      name: 'author',
      isRelation: true,
      onDelete: 'cascade',
    })
  })

  it('parses @onDelete(setNull) modifier', () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity User { id: Int @id }
      entity Todo { id: Int @id author: User @onDelete(setNull) }
    `)
    expect(ast.entities[1]?.fields[1]?.onDelete).toBe('setNull')
  })
})

describe('Parser — new field types and modifiers (Phase 2)', () => {
  it('parses Text field type', () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity Post { id: Int @id body: Text }
    `)
    expect(ast.entities[0]?.fields[1]).toMatchObject({
      name: 'body',
      type: 'Text',
      isRelation: false,
    })
  })

  it('parses Json field type', () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity Post { id: Int @id metadata: Json }
    `)
    expect(ast.entities[0]?.fields[1]).toMatchObject({
      name: 'metadata',
      type: 'Json',
      isRelation: false,
    })
  })

  it('parses @nullable modifier', () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity Post { id: Int @id body: Text @nullable }
    `)
    const bodyField = ast.entities[0]?.fields[1]
    expect(bodyField?.nullable).toBe(true)
    expect(bodyField?.modifiers).toContain('nullable')
  })

  it('parses @updatedAt modifier', () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity Post { id: Int @id updatedAt: DateTime @updatedAt }
    `)
    const field = ast.entities[0]?.fields[1]
    expect(field?.isUpdatedAt).toBe(true)
    expect(field?.modifiers).toContain('updatedAt')
  })

  it('parses @default(now) modifier', () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity Post { id: Int @id createdAt: DateTime @default(now) }
    `)
    const field = ast.entities[0]?.fields[1]
    expect(field?.defaultValue).toBe('now')
    expect(field?.modifiers).toContain('default_now')
  })

  it('parses @default with a string value', () => {
    const ast = parse(`
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      entity Post { id: Int @id status: String @default("draft") }
    `)
    const field = ast.entities[0]?.fields[1]
    expect(field?.defaultValue).toBe('draft')
  })
})

describe('Parser — snapshot: full-featured fixture', () => {
  it('matches snapshot', () => {
    const source = readFileSync(join(FIXTURES_DIR, 'full-featured.vasp'), 'utf8')
    const ast = parse(source, 'full-featured.vasp')
    // Remove loc data for cleaner snapshot comparison
    const clean = JSON.parse(JSON.stringify(ast, (key, val) => key === 'loc' ? undefined : val))
    expect(clean).toMatchSnapshot()
  })
})

describe('Parser — snapshot: minimal fixture', () => {
  it('matches snapshot', () => {
    const source = readFileSync(join(FIXTURES_DIR, 'minimal.vasp'), 'utf8')
    const ast = parse(source, 'minimal.vasp')
    const clean = JSON.parse(JSON.stringify(ast, (key, val) => key === 'loc' ? undefined : val))
    expect(clean).toMatchSnapshot()
  })
})
