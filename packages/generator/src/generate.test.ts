import { parse } from '@vasp-framework/parser'
import { mkdirSync, rmSync, existsSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { generate } from './generate.js'

const TEMPLATES_DIR = join(import.meta.dirname, '..', '..', '..', 'templates')
const TMP_DIR = join(import.meta.dirname, '__test_output__')

const MINIMAL_VASP = `
app MinimalApp {
  title: "Minimal Test App"
  db: Drizzle
  ssr: false
  typescript: false
}

route HomeRoute {
  path: "/"
  to: HomePage
}

page HomePage {
  component: import Home from "@src/pages/Home.vue"
}
`

const TS_VASP = `
app TsApp {
  title: "TypeScript App"
  db: Drizzle
  ssr: false
  typescript: true
}

route HomeRoute {
  path: "/"
  to: HomePage
}

page HomePage {
  component: import Home from "@src/pages/Home.vue"
}

crud Todo {
  entity: Todo
  operations: [list, create]
}

query getTodos {
  fn: import { getTodos } from "@src/queries.ts"
  entities: [Todo]
}

action createTodo {
  fn: import { createTodo } from "@src/actions.ts"
  entities: [Todo]
}
`

const WITH_QUERY_VASP = `
app TodoApp {
  title: "Todo App"
  db: Drizzle
  ssr: false
  typescript: false
}

route HomeRoute {
  path: "/"
  to: HomePage
}

page HomePage {
  component: import Home from "@src/pages/Home.vue"
}

crud Todo {
  entity: Todo
  operations: [list, create, update, delete]
}

query getTodos {
  fn: import { getTodos } from "@src/queries.js"
  entities: [Todo]
}

action createTodo {
  fn: import { createTodo } from "@src/actions.js"
  entities: [Todo]
}
`

describe('generate()', () => {
  beforeEach(() => {
    mkdirSync(TMP_DIR, { recursive: true })
  })

  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true })
  })

  it('generates files for a minimal SPA+JS app', () => {
    const ast = parse(MINIMAL_VASP)
    const outputDir = join(TMP_DIR, 'minimal')
    const result = generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent' })

    expect(result.success).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.filesWritten.length).toBeGreaterThan(0)

    // Key files must exist
    expect(existsSync(join(outputDir, 'package.json'))).toBe(true)
    expect(existsSync(join(outputDir, 'bunfig.toml'))).toBe(true)
    expect(existsSync(join(outputDir, 'drizzle/schema.js'))).toBe(true)
    expect(existsSync(join(outputDir, 'server/index.js'))).toBe(true)
    expect(existsSync(join(outputDir, 'server/db/client.js'))).toBe(true)
    expect(existsSync(join(outputDir, 'index.html'))).toBe(true)
    expect(existsSync(join(outputDir, 'vite.config.js'))).toBe(true)
    expect(existsSync(join(outputDir, 'src/main.js'))).toBe(true)
    expect(existsSync(join(outputDir, 'src/App.vue'))).toBe(true)
    expect(existsSync(join(outputDir, 'src/router/index.js'))).toBe(true)
    expect(existsSync(join(outputDir, 'src/vasp/plugin.js'))).toBe(true)
    expect(existsSync(join(outputDir, 'src/vasp/client/index.js'))).toBe(true)
  })

  it('package.json contains correct app name', () => {
    const ast = parse(MINIMAL_VASP)
    const outputDir = join(TMP_DIR, 'pkg-test')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent' })

    const pkg = JSON.parse(readFileSync(join(outputDir, 'package.json'), 'utf8'))
    expect(pkg.name).toBe('minimal-app')
    expect(pkg.dependencies).toHaveProperty('elysia')
    expect(pkg.dependencies).toHaveProperty('vue')
    expect(pkg.dependencies).toHaveProperty('@vasp-framework/runtime')
  })

  it('generates query and action route files', () => {
    const ast = parse(WITH_QUERY_VASP)
    const outputDir = join(TMP_DIR, 'with-query')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent' })

    expect(existsSync(join(outputDir, 'server/routes/queries/getTodos.js'))).toBe(true)
    expect(existsSync(join(outputDir, 'server/routes/actions/createTodo.js'))).toBe(true)
    expect(existsSync(join(outputDir, 'src/vasp/client/queries.js'))).toBe(true)
    expect(existsSync(join(outputDir, 'src/vasp/client/actions.js'))).toBe(true)
  })

  it('server/index.js imports generated routes', () => {
    const ast = parse(WITH_QUERY_VASP)
    const outputDir = join(TMP_DIR, 'server-imports')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent' })

    const serverIndex = readFileSync(join(outputDir, 'server/index.js'), 'utf8')
    expect(serverIndex).toContain('getTodosRoute')
    expect(serverIndex).toContain('createTodoRoute')
  })

  it('router/index.js includes generated routes', () => {
    const ast = parse(MINIMAL_VASP)
    const outputDir = join(TMP_DIR, 'router-test')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent' })

    const router = readFileSync(join(outputDir, 'src/router/index.js'), 'utf8')
    expect(router).toContain('path: \'/\'')
    expect(router).toContain('@src/pages/Home.vue')
  })

  it('scaffolds empty page Vue files', () => {
    const ast = parse(MINIMAL_VASP)
    const outputDir = join(TMP_DIR, 'page-scaffold')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent' })

    expect(existsSync(join(outputDir, 'src/pages/Home.vue'))).toBe(true)
  })

  it('TypeScript mode: generates .ts files and tsconfig.json', () => {
    const ast = parse(TS_VASP)
    const outputDir = join(TMP_DIR, 'ts-mode')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent' })

    // Key TypeScript files
    expect(existsSync(join(outputDir, 'tsconfig.json'))).toBe(true)
    expect(existsSync(join(outputDir, 'vite.config.ts'))).toBe(true)
    expect(existsSync(join(outputDir, 'src/main.ts'))).toBe(true)
    expect(existsSync(join(outputDir, 'src/router/index.ts'))).toBe(true)
    expect(existsSync(join(outputDir, 'src/vasp/plugin.ts'))).toBe(true)
    expect(existsSync(join(outputDir, 'server/index.ts'))).toBe(true)
    expect(existsSync(join(outputDir, 'server/db/client.ts'))).toBe(true)
    expect(existsSync(join(outputDir, 'drizzle/schema.ts'))).toBe(true)

    // No .js files for main app entry points
    expect(existsSync(join(outputDir, 'src/main.js'))).toBe(false)
    expect(existsSync(join(outputDir, 'vite.config.js'))).toBe(false)
  })

  it('TypeScript mode: generates typed client SDK', () => {
    const ast = parse(TS_VASP)
    const outputDir = join(TMP_DIR, 'ts-sdk')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent' })

    expect(existsSync(join(outputDir, 'src/vasp/client/queries.ts'))).toBe(true)
    expect(existsSync(join(outputDir, 'src/vasp/client/actions.ts'))).toBe(true)
    expect(existsSync(join(outputDir, 'src/vasp/client/types.ts'))).toBe(true)

    const queries = readFileSync(join(outputDir, 'src/vasp/client/queries.ts'), 'utf8')
    expect(queries).toContain('Promise<GetTodosReturn>')

    const types = readFileSync(join(outputDir, 'src/vasp/client/types.ts'), 'utf8')
    expect(types).toContain('GetTodosArgs')
    expect(types).toContain('CreateTodoArgs')
  })

  it('TypeScript mode: drizzle schema includes InferSelectModel', () => {
    const ast = parse(TS_VASP)
    const outputDir = join(TMP_DIR, 'ts-schema')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent' })

    const schema = readFileSync(join(outputDir, 'drizzle/schema.ts'), 'utf8')
    expect(schema).toContain('InferSelectModel')
    expect(schema).toContain('InferInsertModel')
  })

  it('generates auth server files when auth block present', () => {
    const source = `
      app AuthApp {
        title: "Auth App"
        db: Drizzle
        ssr: false
        typescript: false
      }
      auth User {
        userEntity: User
        methods: [ usernameAndPassword, google ]
      }
      route HomeRoute { path: "/" to: HomePage }
      page HomePage { component: import Home from "@src/pages/Home.vue" }
    `
    const ast = parse(source)
    const outputDir = join(TMP_DIR, 'auth-test')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent' })

    expect(existsSync(join(outputDir, 'server/auth/index.js'))).toBe(true)
    expect(existsSync(join(outputDir, 'server/auth/middleware.js'))).toBe(true)
    expect(existsSync(join(outputDir, 'server/auth/providers/usernameAndPassword.js'))).toBe(true)
    expect(existsSync(join(outputDir, 'server/auth/providers/google.js'))).toBe(true)
    expect(existsSync(join(outputDir, 'server/auth/providers/github.js'))).toBe(false) // not in methods
    expect(existsSync(join(outputDir, 'src/vasp/auth.js'))).toBe(true)
    expect(existsSync(join(outputDir, 'src/pages/Login.vue'))).toBe(true)
    expect(existsSync(join(outputDir, 'src/pages/Register.vue'))).toBe(true)
  })

  it('users table is generated in schema when auth is present', () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      auth User { userEntity: User methods: [usernameAndPassword] }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
    `
    const ast = parse(source)
    const outputDir = join(TMP_DIR, 'auth-schema')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent' })

    const schema = readFileSync(join(outputDir, 'drizzle/schema.js'), 'utf8')
    expect(schema).toContain('users')
    expect(schema).toContain('passwordHash')
  })

  it('drizzle schema has correct entity tables', () => {
    const ast = parse(WITH_QUERY_VASP)
    const outputDir = join(TMP_DIR, 'schema-test')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent' })

    const schema = readFileSync(join(outputDir, 'drizzle/schema.js'), 'utf8')
    expect(schema).toContain('todos')
  })

  it('generates CRUD route files and client helpers', () => {
    const ast = parse(WITH_QUERY_VASP)
    const outputDir = join(TMP_DIR, 'crud-test')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent' })

    expect(existsSync(join(outputDir, 'server/routes/crud/todo.js'))).toBe(true)
    expect(existsSync(join(outputDir, 'src/vasp/client/crud.js'))).toBe(true)

    const route = readFileSync(join(outputDir, 'server/routes/crud/todo.js'), 'utf8')
    expect(route).toContain("prefix: '/api/crud/todo'")
    expect(route).toContain(".get('/'")   // list
    expect(route).toContain(".post('/'")  // create

    const crud = readFileSync(join(outputDir, 'src/vasp/client/crud.js'), 'utf8')
    expect(crud).toContain('useTodoCrud')
  })

  it('generates realtime WebSocket channel files', () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      crud Todo { entity: Todo operations: [list] }
      realtime TodoChannel { entity: Todo events: [created, updated] }
    `
    const ast = parse(source)
    const outputDir = join(TMP_DIR, 'realtime-test')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent' })

    expect(existsSync(join(outputDir, 'server/routes/realtime/todoChannel.js'))).toBe(true)
    expect(existsSync(join(outputDir, 'server/routes/realtime/index.js'))).toBe(true)
    expect(existsSync(join(outputDir, 'src/vasp/client/realtime.js'))).toBe(true)

    const channel = readFileSync(join(outputDir, 'server/routes/realtime/todoChannel.js'), 'utf8')
    expect(channel).toContain('publishTodoChannel')
    expect(channel).toContain('/ws/todoChannel')
  })

  it('generates job worker and schedule endpoint', () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      job sendWelcomeEmail {
        executor: PgBoss
        perform: {
          fn: import { sendWelcomeEmail } from "@src/jobs.js"
        }
      }
    `
    const ast = parse(source)
    const outputDir = join(TMP_DIR, 'jobs-test')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent' })

    expect(existsSync(join(outputDir, 'server/jobs/boss.js'))).toBe(true)
    expect(existsSync(join(outputDir, 'server/jobs/sendWelcomeEmail.js'))).toBe(true)
    expect(existsSync(join(outputDir, 'server/routes/jobs/sendWelcomeEmailSchedule.js'))).toBe(true)

    const job = readFileSync(join(outputDir, 'server/jobs/sendWelcomeEmail.js'), 'utf8')
    expect(job).toContain('sendWelcomeEmail')
    expect(job).toContain('registerSendWelcomeEmailWorker')
    expect(job).toContain('scheduleSendWelcomeEmail')

    const serverIndex = readFileSync(join(outputDir, 'server/index.js'), 'utf8')
    expect(serverIndex).toContain('sendWelcomeEmailScheduleRoute')
  })

  it('TypeScript CRUD: generates typed crud.ts with entity types', () => {
    const ast = parse(TS_VASP)
    const outputDir = join(TMP_DIR, 'ts-crud')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent' })

    expect(existsSync(join(outputDir, 'server/routes/crud/todo.ts'))).toBe(true)
    expect(existsSync(join(outputDir, 'src/vasp/client/crud.ts'))).toBe(true)

    const crud = readFileSync(join(outputDir, 'src/vasp/client/crud.ts'), 'utf8')
    expect(crud).toContain('Promise<Todo[]>')
    expect(crud).toContain('Promise<Todo>')
  })

  // ── Phase 6: SSR / Nuxt 4 ──────────────────────────────────────────────

  it('SSR JS: generates nuxt.config.js, app.vue, and dual-transport plugins', () => {
    const source = `
      app SsrApp {
        title: "SSR App"
        db: Drizzle
        ssr: true
        typescript: false
      }

      route HomeRoute {
        path: "/"
        to: HomePage
      }

      page HomePage {
        component: import Home from "@src/pages/Home.vue"
      }

      crud Todo {
        entity: Todo
        operations: [list, create]
      }

      query getTodos {
        fn: import { getTodos } from "@src/queries.js"
        entities: [Todo]
      }
    `
    const ast = parse(source)
    const outputDir = join(TMP_DIR, 'ssr-js')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent' })

    expect(existsSync(join(outputDir, 'nuxt.config.js'))).toBe(true)
    expect(existsSync(join(outputDir, 'app.vue'))).toBe(true)
    expect(existsSync(join(outputDir, 'plugins/vasp.server.js'))).toBe(true)
    expect(existsSync(join(outputDir, 'plugins/vasp.client.js'))).toBe(true)
    expect(existsSync(join(outputDir, 'composables/useVasp.js'))).toBe(true)

    const serverPlugin = readFileSync(join(outputDir, 'plugins/vasp.server.js'), 'utf8')
    expect(serverPlugin).toContain('defineNuxtPlugin')
    expect(serverPlugin).toContain('getTodos')
    expect(serverPlugin).toContain("Unknown query:")

    const clientPlugin = readFileSync(join(outputDir, 'plugins/vasp.client.js'), 'utf8')
    expect(clientPlugin).toContain('defineNuxtPlugin')
    expect(clientPlugin).toContain('$fetch')
    expect(clientPlugin).toContain('/queries/')
  })

  it('SSR JS: generates Nuxt pages/ files from vasp routes', () => {
    const source = `
      app SsrApp {
        title: "SSR App"
        db: Drizzle
        ssr: true
        typescript: false
      }

      route HomeRoute { path: "/" to: HomePage }
      route AboutRoute { path: "/about" to: AboutPage }

      page HomePage { component: import Home from "@src/pages/Home.vue" }
      page AboutPage { component: import About from "@src/pages/About.vue" }
    `
    const ast = parse(source)
    const outputDir = join(TMP_DIR, 'ssr-pages')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent' })

    expect(existsSync(join(outputDir, 'pages/index.vue'))).toBe(true)
    expect(existsSync(join(outputDir, 'pages/about.vue'))).toBe(true)

    const indexPage = readFileSync(join(outputDir, 'pages/index.vue'), 'utf8')
    expect(indexPage).toContain('<Home />')
    expect(indexPage).toContain("import Home from '@src/pages/Home.vue'")
  })

  it('SSR TS: generates nuxt.config.ts with typescript: true and typed plugins', () => {
    const source = `
      app SsrTsApp {
        title: "SSR TS App"
        db: Drizzle
        ssr: true
        typescript: true
      }

      route HomeRoute { path: "/" to: HomePage }
      page HomePage { component: import Home from "@src/pages/Home.vue" }

      crud Todo {
        entity: Todo
        operations: [list, create]
      }

      query getTodos {
        fn: import { getTodos } from "@src/queries.ts"
        entities: [Todo]
      }
    `
    const ast = parse(source)
    const outputDir = join(TMP_DIR, 'ssr-ts')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent' })

    expect(existsSync(join(outputDir, 'nuxt.config.ts'))).toBe(true)
    expect(existsSync(join(outputDir, 'plugins/vasp.server.ts'))).toBe(true)
    expect(existsSync(join(outputDir, 'plugins/vasp.client.ts'))).toBe(true)
    expect(existsSync(join(outputDir, 'composables/useVasp.ts'))).toBe(true)

    const nuxtConfig = readFileSync(join(outputDir, 'nuxt.config.ts'), 'utf8')
    expect(nuxtConfig).toContain("strict: true")

    const serverPlugin = readFileSync(join(outputDir, 'plugins/vasp.server.ts'), 'utf8')
    expect(serverPlugin).toContain('Promise<T>')
    expect(serverPlugin).toContain('getTodos')
  })

  it('SSR: generates auth composable and route middleware when auth block present', () => {
    const source = `
      app SsrAuthApp {
        title: "SSR Auth App"
        db: Drizzle
        ssr: true
        typescript: false
      }

      auth UserAuth {
        userEntity: User
        methods: [usernameAndPassword]
      }

      route HomeRoute { path: "/" to: HomePage }
      page HomePage { component: import Home from "@src/pages/Home.vue" }
    `
    const ast = parse(source)
    const outputDir = join(TMP_DIR, 'ssr-auth')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent' })

    expect(existsSync(join(outputDir, 'composables/useAuth.js'))).toBe(true)
    expect(existsSync(join(outputDir, 'middleware/auth.js'))).toBe(true)
    expect(existsSync(join(outputDir, 'pages/login.vue'))).toBe(true)
    expect(existsSync(join(outputDir, 'pages/register.vue'))).toBe(true)

    const middleware = readFileSync(join(outputDir, 'middleware/auth.js'), 'utf8')
    expect(middleware).toContain('defineNuxtRouteMiddleware')
    expect(middleware).toContain("navigateTo('/login')")
  })
})
