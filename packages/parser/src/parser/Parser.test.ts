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

describe('Parser — error cases', () => {
  it('throws on unknown top-level token', () => {
    expect(() => parse('unknown Foo {}')).toThrow('E010_UNEXPECTED_TOKEN')
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
