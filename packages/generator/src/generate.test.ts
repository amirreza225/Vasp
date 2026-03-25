import { parse } from '@vasp-framework/parser'
import { mkdirSync, rmSync, existsSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { generate } from './generate.js'
import { TemplateEngine } from './template/TemplateEngine.js'

const TEMPLATES_DIR = join(import.meta.dirname, '..', '..', '..', 'templates')
const TMP_DIR = join(import.meta.dirname, '__test_output__')

// Shared engine instance — avoids creating 47 separate Handlebars environments
// and compiling ~97 templates per test (the main cause of OOM in CI).
let sharedEngine: TemplateEngine
beforeAll(() => {
  sharedEngine = new TemplateEngine()
  sharedEngine.loadDirectory(TEMPLATES_DIR)
})

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

const WITH_API_VASP = `
app ApiApp {
  title: "API App"
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

api uploadRecipeImage {
  method: POST
  path: "/api/recipes/:id/image"
  fn: import { uploadRecipeImage } from "@src/api.js"
  auth: true
}
`

const WITH_RBAC_VASP = `
app RbacApp {
  title: "RBAC App"
  db: Drizzle
  ssr: false
  typescript: false
}

auth UserAuth {
  userEntity: User
  methods: [usernameAndPassword]
  roles: [admin, editor]
}

entity User {
  id: Int @id
  username: String
  role: String
}

entity Todo {
  id: Int @id
  title: String
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
  auth: true
  roles: [editor]
}

action createTodo {
  fn: import { createTodo } from "@src/actions.js"
  entities: [Todo]
  auth: true
  roles: [admin]
}

api uploadRecipeImage {
  method: POST
  path: "/api/recipes/:id/image"
  fn: import { uploadRecipeImage } from "@src/api.js"
  auth: true
  roles: [admin]
}
`

const WITH_MIDDLEWARE_VASP = `
app MiddlewareApp {
  title: "Middleware App"
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

middleware Logger {
  fn: import logger from "@src/middleware/logger.js"
  scope: global
}

middleware RouteOnly {
  fn: import routeOnly from "@src/middleware/routeOnly.js"
  scope: route
}
`

const WITH_ENV_SCHEMA_VASP = `
app EnvApp {
  title: "Env App"
  db: Drizzle
  ssr: false
  typescript: false
  env: {
    DATABASE_URL: required
    GOOGLE_CLIENT_ID: optional
  }
}

route HomeRoute {
  path: "/"
  to: HomePage
}

page HomePage {
  component: import Home from "@src/pages/Home.vue"
}
`

const WITH_SEED_VASP = `
app SeedApp {
  title: "Seed App"
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

seed {
  fn: import seedData from "@src/seed.js"
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
    const result = generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

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
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

    const pkg = JSON.parse(readFileSync(join(outputDir, 'package.json'), 'utf8'))
    expect(pkg.name).toBe('minimal-app')
    expect(pkg.dependencies).toHaveProperty('elysia')
    expect(pkg.dependencies).toHaveProperty('vue')
    expect(pkg.dependencies).toHaveProperty('@vasp-framework/runtime')
  })

  it('generates query and action route files', () => {
    const ast = parse(WITH_QUERY_VASP)
    const outputDir = join(TMP_DIR, 'with-query')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

    expect(existsSync(join(outputDir, 'server/routes/queries/getTodos.js'))).toBe(true)
    expect(existsSync(join(outputDir, 'server/routes/actions/createTodo.js'))).toBe(true)
    expect(existsSync(join(outputDir, 'src/vasp/client/queries.js'))).toBe(true)
    expect(existsSync(join(outputDir, 'src/vasp/client/actions.js'))).toBe(true)
  })

  it('server/index.js imports generated routes', () => {
    const ast = parse(WITH_QUERY_VASP)
    const outputDir = join(TMP_DIR, 'server-imports')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

    const serverIndex = readFileSync(join(outputDir, 'server/index.js'), 'utf8')
    expect(serverIndex).toContain('getTodosRoute')
    expect(serverIndex).toContain('createTodoRoute')
  })

  it('generates custom api route files and wires them in server index', () => {
    const ast = parse(WITH_API_VASP)
    const outputDir = join(TMP_DIR, 'with-api')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

    expect(existsSync(join(outputDir, 'server/routes/api/uploadRecipeImage.js'))).toBe(true)

    const apiRoute = readFileSync(join(outputDir, 'server/routes/api/uploadRecipeImage.js'), 'utf8')
    expect(apiRoute).toContain('.post(')
    expect(apiRoute).toContain('/api/recipes/:id/image')
    expect(apiRoute).toContain('requireAuth')

    const serverIndex = readFileSync(join(outputDir, 'server/index.js'), 'utf8')
    expect(serverIndex).toContain('uploadRecipeImageApiRoute')
  })

  it('emits requireRole guards for role-protected query/action/api routes', () => {
    const ast = parse(WITH_RBAC_VASP)
    const outputDir = join(TMP_DIR, 'with-rbac')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

    const queryRoute = readFileSync(join(outputDir, 'server/routes/queries/getTodos.js'), 'utf8')
    expect(queryRoute).toContain('requireRole')
    expect(queryRoute).toContain(".use(requireRole(['editor']))")

    const actionRoute = readFileSync(join(outputDir, 'server/routes/actions/createTodo.js'), 'utf8')
    expect(actionRoute).toContain(".use(requireRole(['admin']))")

    const apiRoute = readFileSync(join(outputDir, 'server/routes/api/uploadRecipeImage.js'), 'utf8')
    expect(apiRoute).toContain(".use(requireRole(['admin']))")

    const authMiddleware = readFileSync(join(outputDir, 'server/auth/middleware.js'), 'utf8')
    expect(authMiddleware).toContain('export function requireRole')
  })

  it('wires global middleware in server index and creates src middleware stubs', () => {
    const ast = parse(WITH_MIDDLEWARE_VASP)
    const outputDir = join(TMP_DIR, 'with-middleware')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

    const serverIndex = readFileSync(join(outputDir, 'server/index.js'), 'utf8')
    expect(serverIndex).toContain("import loggerMiddleware from '../src/middleware/logger.js'")
    expect(serverIndex).toContain('.use(loggerMiddleware)')

    expect(serverIndex).not.toContain("import routeOnly from '../src/middleware/routeOnly.js'")
    expect(serverIndex).not.toContain('.use(routeOnly)')

    expect(existsSync(join(outputDir, 'src/middleware/logger.js'))).toBe(true)
    expect(existsSync(join(outputDir, 'src/middleware/routeOnly.js'))).toBe(true)
  })

  it('generates startup env validation for required app.env keys', () => {
    const ast = parse(WITH_ENV_SCHEMA_VASP)
    const outputDir = join(TMP_DIR, 'with-env-schema')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

    const serverIndex = readFileSync(join(outputDir, 'server/index.js'), 'utf8')
    expect(serverIndex).toContain('const REQUIRED_ENV_VARS = [\'DATABASE_URL\']')
    expect(serverIndex).toContain('Missing required environment variables')
    expect(serverIndex).toContain('process.exit(1)')
    expect(serverIndex).not.toContain('GOOGLE_CLIENT_ID')
  })

  it('generates seed runner, script, and source seed stub', () => {
    const ast = parse(WITH_SEED_VASP)
    const outputDir = join(TMP_DIR, 'with-seed')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

    expect(existsSync(join(outputDir, 'server/db/seed.js'))).toBe(true)
    expect(existsSync(join(outputDir, 'src/seed.js'))).toBe(true)

    const seedRunner = readFileSync(join(outputDir, 'server/db/seed.js'), 'utf8')
    expect(seedRunner).toContain("import seedData from '../../src/seed.js'")
    expect(seedRunner).toContain('Seed completed')

    const pkg = JSON.parse(readFileSync(join(outputDir, 'package.json'), 'utf8'))
    expect(pkg.scripts['db:seed']).toBe('bun server/db/seed.js')
  })

  it('router/index.js includes generated routes', () => {
    const ast = parse(MINIMAL_VASP)
    const outputDir = join(TMP_DIR, 'router-test')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

    const router = readFileSync(join(outputDir, 'src/router/index.js'), 'utf8')
    expect(router).toContain('path: \'/\'')
    expect(router).toContain('@src/pages/Home.vue')
  })

  it('scaffolds empty page Vue files', () => {
    const ast = parse(MINIMAL_VASP)
    const outputDir = join(TMP_DIR, 'page-scaffold')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

    expect(existsSync(join(outputDir, 'src/pages/Home.vue'))).toBe(true)
  })

  it('TypeScript mode: generates .ts files and tsconfig.json', () => {
    const ast = parse(TS_VASP)
    const outputDir = join(TMP_DIR, 'ts-mode')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

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
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

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
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

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
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

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
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

    const schema = readFileSync(join(outputDir, 'drizzle/schema.js'), 'utf8')
    expect(schema).toContain('users')
    expect(schema).toContain('passwordHash')
  })

  it('drizzle schema has correct entity tables', () => {
    const ast = parse(WITH_QUERY_VASP)
    const outputDir = join(TMP_DIR, 'schema-test')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

    const schema = readFileSync(join(outputDir, 'drizzle/schema.js'), 'utf8')
    expect(schema).toContain('todos')
  })

  it('generates CRUD route files and client helpers', () => {
    const ast = parse(WITH_QUERY_VASP)
    const outputDir = join(TMP_DIR, 'crud-test')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

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
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

    expect(existsSync(join(outputDir, 'server/routes/realtime/todoChannel.js'))).toBe(true)
    expect(existsSync(join(outputDir, 'server/routes/realtime/index.js'))).toBe(true)
    expect(existsSync(join(outputDir, 'src/vasp/client/realtime.js'))).toBe(true)

    const channel = readFileSync(join(outputDir, 'server/routes/realtime/todoChannel.js'), 'utf8')
    expect(channel).toContain('publishTodoChannel')
    expect(channel).toContain('/ws/todoChannel')

    // CRUD file must import using the realtime block name (publishTodoChannel),
    // not the entity name (publishTodo)
    const crudFile = readFileSync(join(outputDir, 'server/routes/crud/todo.js'), 'utf8')
    expect(crudFile).toContain("publishTodoChannel")
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
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

    expect(existsSync(join(outputDir, 'server/jobs/boss.js'))).toBe(true)
    expect(existsSync(join(outputDir, 'server/jobs/sendWelcomeEmail.js'))).toBe(true)
    expect(existsSync(join(outputDir, 'server/routes/jobs/sendWelcomeEmailSchedule.js'))).toBe(true)

    const job = readFileSync(join(outputDir, 'server/jobs/sendWelcomeEmail.js'), 'utf8')
    expect(job).toContain('sendWelcomeEmail')
    expect(job).toContain('registerSendWelcomeEmailWorker')
    expect(job).toContain('scheduleSendWelcomeEmail')

    const schedule = readFileSync(join(outputDir, 'server/routes/jobs/sendWelcomeEmailSchedule.js'), 'utf8')
    expect(schedule).toContain("from '../../jobs/sendWelcomeEmail.js'")

    const serverIndex = readFileSync(join(outputDir, 'server/index.js'), 'utf8')
    expect(serverIndex).toContain('sendWelcomeEmailScheduleRoute')
  })

  it('TypeScript CRUD: generates typed crud.ts with entity types', () => {
    const ast = parse(TS_VASP)
    const outputDir = join(TMP_DIR, 'ts-crud')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

    expect(existsSync(join(outputDir, 'server/routes/crud/todo.ts'))).toBe(true)
    expect(existsSync(join(outputDir, 'src/vasp/client/crud.ts'))).toBe(true)

    const crud = readFileSync(join(outputDir, 'src/vasp/client/crud.ts'), 'utf8')
    expect(crud).toContain('Todo[]')
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
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

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
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

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
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

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
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

    expect(existsSync(join(outputDir, 'composables/useAuth.js'))).toBe(true)
    expect(existsSync(join(outputDir, 'middleware/auth.js'))).toBe(true)
    expect(existsSync(join(outputDir, 'pages/login.vue'))).toBe(true)
    expect(existsSync(join(outputDir, 'pages/register.vue'))).toBe(true)

    const middleware = readFileSync(join(outputDir, 'middleware/auth.js'), 'utf8')
    expect(middleware).toContain('defineNuxtRouteMiddleware')
    expect(middleware).toContain("navigateTo('/login')")
  })

  // ── Phase 2: Entity Relationships & Rich Schema ─────────────────────────

  it('schema: generates FK column + Drizzle relations block for many-to-one relation', () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }

      entity User { id: Int @id username: String todos: Todo[] }
      entity Todo { id: Int @id title: String author: User @onDelete(cascade) }

      crud Todo { entity: Todo operations: [list, create, update, delete] }
    `
    const ast = parse(source)
    const outputDir = join(TMP_DIR, 'schema-relations')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

    const schema = readFileSync(join(outputDir, 'drizzle/schema.js'), 'utf8')
    // FK column for many-to-one
    expect(schema).toContain('authorId')
    expect(schema).toContain("references(() => users.id")
    expect(schema).toContain("onDelete: 'cascade'")
    // Drizzle relations block (stable relations API)
    expect(schema).toContain("import { relations } from 'drizzle-orm'")
    expect(schema).toContain('todosRelations = relations(todos')
    expect(schema).toContain("one(users, { fields: [todos.authorId], references: [users.id] })")
    expect(schema).toContain('usersRelations = relations(users')
    expect(schema).toContain('many(todos)')
    // Both entity tables generated
    expect(schema).toContain('todos =')
    expect(schema).toContain('users =')
  })

  it('schema: generates Text as text() and Json as jsonb() columns', () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }

      entity Post { id: Int @id body: Text @nullable metadata: Json @nullable }
      crud Post { entity: Post operations: [list, create] }
    `
    const ast = parse(source)
    const outputDir = join(TMP_DIR, 'schema-types')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

    const schema = readFileSync(join(outputDir, 'drizzle/schema.js'), 'utf8')
    expect(schema).toContain("text('body')")
    expect(schema).toContain("jsonb('metadata')")
    // @nullable means no .notNull()
    expect(schema).not.toMatch(/text\('body'\)\.notNull\(\)/)
    expect(schema).not.toMatch(/jsonb\('metadata'\)\.notNull\(\)/)
  })

  it('schema: generates @updatedAt column with .$onUpdate()', () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }

      entity Post { id: Int @id lastModified: DateTime @updatedAt }
      crud Post { entity: Post operations: [list] }
    `
    const ast = parse(source)
    const outputDir = join(TMP_DIR, 'schema-updatedat')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

    const schema = readFileSync(join(outputDir, 'drizzle/schema.js'), 'utf8')
    expect(schema).toContain('$onUpdate(() => new Date())')
  })

  it('crud: uses db.query with `with` for entities that have relations', () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }

      entity User { id: Int @id username: String }
      entity Todo { id: Int @id title: String author: User @onDelete(cascade) }

      crud Todo { entity: Todo operations: [list, create, update, delete] }
    `
    const ast = parse(source)
    const outputDir = join(TMP_DIR, 'crud-with-relations')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

    const route = readFileSync(join(outputDir, 'server/routes/crud/todo.js'), 'utf8')
    // Should use db.query relational API
    expect(route).toContain('db.query')
    expect(route).toContain('findMany')
    expect(route).toContain('findFirst')
    expect(route).toContain('author: true')
  })

  // ── Phase 3: End-to-End Type Safety ────────────────────────────────────

  it('TS: generates shared/types.ts with entity interfaces and input types', () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: true }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }

      entity User { id: Int @id username: String @unique email: String @nullable }
      entity Todo { id: Int @id title: String done: Boolean author: User @onDelete(cascade) }

      crud Todo { entity: Todo operations: [list, create, update, delete] }
    `
    const ast = parse(source)
    const outputDir = join(TMP_DIR, 'shared-types')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

    expect(existsSync(join(outputDir, 'shared/types.ts'))).toBe(true)
    const types = readFileSync(join(outputDir, 'shared/types.ts'), 'utf8')

    // User interface with proper TS types
    expect(types).toContain('export interface User')
    expect(types).toContain('username: string')
    expect(types).toContain('email: string | null')
    expect(types).toContain('createdAt: Date')
    expect(types).toContain('updatedAt: Date')

    // Todo interface with relation types
    expect(types).toContain('export interface Todo')
    expect(types).toContain('title: string')
    expect(types).toContain('done: boolean')
    expect(types).toContain('author: User')
    expect(types).toContain('authorId: number')

    // Create/Update input types
    expect(types).toContain('export interface CreateUserInput')
    expect(types).toContain('export interface UpdateUserInput')
    expect(types).toContain('export interface CreateTodoInput')
    expect(types).toContain('export interface UpdateTodoInput')

    // CreateTodoInput has authorId (required FK) but not id
    expect(types).toMatch(/CreateTodoInput[\s\S]*?authorId.*: number/)
  })

  it('TS: shared/types.ts includes query/action type stubs', () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: true }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }

      entity Todo { id: Int @id title: String }

      query getTodos {
        fn: import { getTodos } from "@src/queries.ts"
        entities: [Todo]
      }
      action createTodo {
        fn: import { createTodo } from "@src/actions.ts"
        entities: [Todo]
      }
    `
    const ast = parse(source)
    const outputDir = join(TMP_DIR, 'shared-types-stubs')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

    const types = readFileSync(join(outputDir, 'shared/types.ts'), 'utf8')
    expect(types).toContain('export type GetTodosArgs')
    expect(types).toContain('export type GetTodosReturn')
    expect(types).toContain('export type CreateTodoArgs')
    expect(types).toContain('export type CreateTodoReturn')
  })

  it('TS: client types.ts re-exports from @shared/types', () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: true }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }

      entity Todo { id: Int @id title: String }
      crud Todo { entity: Todo operations: [list, create] }

      query getTodos {
        fn: import { getTodos } from "@src/queries.ts"
        entities: [Todo]
      }
    `
    const ast = parse(source)
    const outputDir = join(TMP_DIR, 'client-types-reexport')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

    const types = readFileSync(join(outputDir, 'src/vasp/client/types.ts'), 'utf8')
    expect(types).toContain("@shared/types.js")
    expect(types).toContain('Todo,')
    expect(types).toContain('CreateTodoInput,')
    expect(types).toContain('UpdateTodoInput,')
    expect(types).toContain('GetTodosArgs,')
    expect(types).toContain('GetTodosReturn,')
  })

  it('TS: typed crud composable uses Create/Update input types', () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: true }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }

      entity Recipe { id: Int @id title: String description: Text @nullable }
      crud Recipe { entity: Recipe operations: [list, create, update, delete] }
    `
    const ast = parse(source)
    const outputDir = join(TMP_DIR, 'typed-crud')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

    const crud = readFileSync(join(outputDir, 'src/vasp/client/crud.ts'), 'utf8')
    expect(crud).toContain('CreateRecipeInput')
    expect(crud).toContain('UpdateRecipeInput')
    // Should NOT reference the old New... type pattern
    expect(crud).not.toContain('NewRecipe')
    expect(crud).not.toContain('Partial<')
  })

  it('TS: tsconfig includes @shared path alias', () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: true }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
    `
    const ast = parse(source)
    const outputDir = join(TMP_DIR, 'tsconfig-shared')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

    const tsconfig = readFileSync(join(outputDir, 'tsconfig.json'), 'utf8')
    expect(tsconfig).toContain('"@shared/*"')
    expect(tsconfig).toContain('"./shared/*"')
    expect(tsconfig).toContain('"shared/**/*.ts"')
  })

  it('TS: vite.config.ts includes @shared alias', () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: true }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
    `
    const ast = parse(source)
    const outputDir = join(TMP_DIR, 'vite-shared')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

    const viteConfig = readFileSync(join(outputDir, 'vite.config.ts'), 'utf8')
    expect(viteConfig).toContain("'@shared'")
    expect(viteConfig).toContain("'./shared'")
  })

  it('JS SPA: vite.config.js includes @shared alias', () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
    `
    const ast = parse(source)
    const outputDir = join(TMP_DIR, 'vite-js-shared')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

    const viteConfig = readFileSync(join(outputDir, 'vite.config.js'), 'utf8')
    expect(viteConfig).toContain("'@shared'")
  })

  it('SSR TS: nuxt.config includes @shared alias', () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: true typescript: true }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
    `
    const ast = parse(source)
    const outputDir = join(TMP_DIR, 'nuxt-shared')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

    const nuxtConfig = readFileSync(join(outputDir, 'nuxt.config.ts'), 'utf8')
    expect(nuxtConfig).toContain("'@shared'")
    expect(nuxtConfig).toContain("'~/shared'")
  })

  it('shared/types.ts maps field types correctly', () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: true }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }

      entity Post {
        id: Int @id
        title: String
        body: Text @nullable
        metadata: Json @nullable
        score: Float
        published: Boolean
        publishedAt: DateTime @nullable
      }
    `
    const ast = parse(source)
    const outputDir = join(TMP_DIR, 'types-mapping')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

    const types = readFileSync(join(outputDir, 'shared/types.ts'), 'utf8')
    // String → string
    expect(types).toContain('title: string')
    // Text → string
    expect(types).toContain('body: string | null')
    // Json → unknown
    expect(types).toContain('metadata: unknown | null')
    // Float → number
    expect(types).toContain('score: number')
    // Boolean → boolean
    expect(types).toContain('published: boolean')
    // DateTime → Date
    expect(types).toContain('publishedAt: Date | null')
  })

  it('TS: no shared/types.ts generated when no entities exist', () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: true }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
    `
    const ast = parse(source)
    const outputDir = join(TMP_DIR, 'no-entities')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

    expect(existsSync(join(outputDir, 'shared/types.ts'))).toBe(false)
  })

  it('JS: no shared/types.ts generated for JavaScript apps', () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }

      entity Todo { id: Int @id title: String }
    `
    const ast = parse(source)
    const outputDir = join(TMP_DIR, 'js-no-types')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

    expect(existsSync(join(outputDir, 'shared/types.ts'))).toBe(false)
  })

  // ── Phase 4: Validation, Error UX & Testing ───────────────────────────

  it('generates shared validation schemas from entities', () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: true }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }

      entity Todo { id: Int @id title: String done: Boolean metadata: Json @nullable }
      crud Todo { entity: Todo operations: [list, create, update, delete] }
    `
    const ast = parse(source)
    const outputDir = join(TMP_DIR, 'phase4-validation-shared')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

    expect(existsSync(join(outputDir, 'shared/validation.ts'))).toBe(true)
    const validation = readFileSync(join(outputDir, 'shared/validation.ts'), 'utf8')
    expect(validation).toContain('CreateTodoSchema')
    expect(validation).toContain('UpdateTodoSchema')
    expect(validation).toContain('v.object')
    expect(validation).toContain('v.partial(CreateTodoSchema)')
  })

  it('CRUD routes validate create/update payloads with Valibot', () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }

      entity Todo { id: Int @id title: String }
      crud Todo { entity: Todo operations: [list, create, update] }
    `
    const ast = parse(source)
    const outputDir = join(TMP_DIR, 'phase4-crud-validation')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

    const route = readFileSync(join(outputDir, 'server/routes/crud/todo.js'), 'utf8')
    expect(route).toContain('safeParse')
    expect(route).toContain('CreateTodoSchema')
    expect(route).toContain('UpdateTodoSchema')
    expect(route).toContain('VALIDATION_FAILED')
  })

  it('package.json includes Valibot and vitest setup', () => {
    const ast = parse(MINIMAL_VASP)
    const outputDir = join(TMP_DIR, 'phase4-package')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

    const pkg = JSON.parse(readFileSync(join(outputDir, 'package.json'), 'utf8'))
    expect(pkg.scripts.test).toBe('vitest run')
    expect(pkg.dependencies).not.toHaveProperty('@elysiajs/valibot')
    expect(pkg.dependencies).toHaveProperty('valibot')
    expect(pkg.devDependencies).toHaveProperty('vitest')
  })

  it('SPA generates error boundary and notifications components', () => {
    const ast = parse(MINIMAL_VASP)
    const outputDir = join(TMP_DIR, 'phase4-spa-ux')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

    expect(existsSync(join(outputDir, 'src/components/VaspErrorBoundary.vue'))).toBe(true)
    expect(existsSync(join(outputDir, 'src/components/VaspNotifications.vue'))).toBe(true)
    expect(existsSync(join(outputDir, 'src/vasp/useVaspNotifications.js'))).toBe(true)

    const appVue = readFileSync(join(outputDir, 'src/App.vue'), 'utf8')
    expect(appVue).toContain('VaspErrorBoundary')
    expect(appVue).toContain('VaspNotifications')
  })

  it('SSR generates Nuxt error page', () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: true typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
    `
    const ast = parse(source)
    const outputDir = join(TMP_DIR, 'phase4-ssr-error')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

    expect(existsSync(join(outputDir, 'error.vue'))).toBe(true)
    const errorPage = readFileSync(join(outputDir, 'error.vue'), 'utf8')
    expect(errorPage).toContain('Page not found')
    expect(errorPage).toContain('Authentication required')
  })

  it('SPA client helpers wire auto-toast and loading states', () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: true }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }

      auth U { userEntity: User methods: [usernameAndPassword] }
      entity User { id: Int @id username: String }
      entity Todo { id: Int @id title: String }
      crud Todo { entity: Todo operations: [list, create, update, delete] }
      action createTodo { fn: import { createTodo } from "@src/actions.ts" entities: [Todo] }
    `
    const ast = parse(source)
    const outputDir = join(TMP_DIR, 'phase4-spa-client')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

    const crud = readFileSync(join(outputDir, 'src/vasp/client/crud.ts'), 'utf8')
    expect(crud).toContain('loading = ref(false)')
    expect(crud).toContain('error = ref<string | null>(null)')
    expect(crud).toContain('notifyError')
    expect(crud).toContain('safeParse')

    const actions = readFileSync(join(outputDir, 'src/vasp/client/actions.ts'), 'utf8')
    expect(actions).toContain('notifyError')

    const auth = readFileSync(join(outputDir, 'src/vasp/auth.ts'), 'utf8')
    expect(auth).toContain('notifyError')
  })

  it('generates test scaffolds and Vitest config', () => {
    const source = `
      app A { title: "T" db: Drizzle ssr: false typescript: false }
      route R { path: "/" to: P }
      page P { component: import P from "@src/pages/P.vue" }
      auth U { userEntity: User methods: [usernameAndPassword] }
      entity Todo { id: Int @id title: String }
      crud Todo { entity: Todo operations: [list, create] }
      query getTodos { fn: import { getTodos } from "@src/queries.js" entities: [Todo] }
      action createTodo { fn: import { createTodo } from "@src/actions.js" entities: [Todo] }
    `
    const ast = parse(source)
    const outputDir = join(TMP_DIR, 'phase4-test-scaffold')
    generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

    expect(existsSync(join(outputDir, 'vitest.config.js'))).toBe(true)
    expect(existsSync(join(outputDir, 'tests/setup.js'))).toBe(true)
    expect(existsSync(join(outputDir, 'tests/crud/todo.test.js'))).toBe(true)
    expect(existsSync(join(outputDir, 'tests/queries/getTodos.test.js'))).toBe(true)
    expect(existsSync(join(outputDir, 'tests/actions/createTodo.test.js'))).toBe(true)
    expect(existsSync(join(outputDir, 'tests/auth/login.test.js'))).toBe(true)
  })

  describe('generateMainVasp() field and block serialization', () => {
    it('preserves Enum variants in entity fields', () => {
      const source = `
        app A { title: "T" db: Drizzle ssr: false typescript: false }
        route R { path: "/" to: P }
        page P { component: import P from "@src/pages/P.vue" }
        entity Post {
          id: Int @id
          status: Enum(draft, published, archived) @default("draft")
        }
      `
      const ast = parse(source)
      const outputDir = join(TMP_DIR, 'main-vasp-enum')
      generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

      const mainVasp = readFileSync(join(outputDir, 'main.vasp'), 'utf8')
      expect(mainVasp).toContain('status: Enum(draft, published, archived)')
      expect(mainVasp).toContain('@default("draft")')
    })

    it('preserves array relation fields (Todo[])', () => {
      const source = `
        app A { title: "T" db: Drizzle ssr: false typescript: false }
        route R { path: "/" to: P }
        page P { component: import P from "@src/pages/P.vue" }
        entity User {
          id: Int @id
          todos: Todo[]
        }
        entity Todo {
          id: Int @id
          title: String
          author: User @onDelete(cascade)
        }
      `
      const ast = parse(source)
      const outputDir = join(TMP_DIR, 'main-vasp-array')
      generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

      const mainVasp = readFileSync(join(outputDir, 'main.vasp'), 'utf8')
      expect(mainVasp).toContain('todos: Todo[]')
    })

    it('preserves @onDelete modifier on relation fields', () => {
      const source = `
        app A { title: "T" db: Drizzle ssr: false typescript: false }
        route R { path: "/" to: P }
        page P { component: import P from "@src/pages/P.vue" }
        entity User { id: Int @id }
        entity Todo {
          id: Int @id
          title: String
          author: User @onDelete(cascade)
          reviewer: User @onDelete(setNull) @nullable
        }
      `
      const ast = parse(source)
      const outputDir = join(TMP_DIR, 'main-vasp-ondelete')
      generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

      const mainVasp = readFileSync(join(outputDir, 'main.vasp'), 'utf8')
      expect(mainVasp).toContain('@onDelete(cascade)')
      expect(mainVasp).toContain('@onDelete(setNull)')
    })

    it('preserves @default(now) with closing parenthesis', () => {
      const source = `
        app A { title: "T" db: Drizzle ssr: false typescript: false }
        route R { path: "/" to: P }
        page P { component: import P from "@src/pages/P.vue" }
        entity Event {
          id: Int @id
          createdAt: DateTime @default(now)
          updatedAt: DateTime @updatedAt
        }
      `
      const ast = parse(source)
      const outputDir = join(TMP_DIR, 'main-vasp-defaultnow')
      generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

      const mainVasp = readFileSync(join(outputDir, 'main.vasp'), 'utf8')
      expect(mainVasp).toContain('@default(now)')
      expect(mainVasp).not.toContain('@default(now\n')
      expect(mainVasp).toContain('@updatedAt')
    })

    it('emits realtime blocks in main.vasp', () => {
      const source = `
        app A { title: "T" db: Drizzle ssr: false typescript: false }
        route R { path: "/" to: P }
        page P { component: import P from "@src/pages/P.vue" }
        entity Todo { id: Int @id title: String }
        crud Todo { entity: Todo operations: [list, create] }
        realtime TodoChannel { entity: Todo events: [created, updated, deleted] }
      `
      const ast = parse(source)
      const outputDir = join(TMP_DIR, 'main-vasp-realtime')
      generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

      const mainVasp = readFileSync(join(outputDir, 'main.vasp'), 'utf8')
      expect(mainVasp).toContain('realtime TodoChannel {')
      expect(mainVasp).toContain('entity: Todo')
      expect(mainVasp).toContain('events: [created, updated, deleted]')
    })

    it('emits job blocks (with and without schedule) in main.vasp', () => {
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
        job cleanup {
          executor: PgBoss
          perform: {
            fn: import { cleanup } from "@src/jobs.js"
          }
          schedule: "0 2 * * *"
        }
      `
      const ast = parse(source)
      const outputDir = join(TMP_DIR, 'main-vasp-jobs')
      generate(ast, { outputDir, templateDir: TEMPLATES_DIR, logLevel: 'silent', engine: sharedEngine })

      const mainVasp = readFileSync(join(outputDir, 'main.vasp'), 'utf8')
      expect(mainVasp).toContain('job sendWelcomeEmail {')
      expect(mainVasp).toContain('executor: PgBoss')
      expect(mainVasp).toContain('fn: import { sendWelcomeEmail } from "@src/jobs.js"')
      expect(mainVasp).toContain('job cleanup {')
      expect(mainVasp).toContain('schedule: "0 2 * * *"')
    })
  })
})
