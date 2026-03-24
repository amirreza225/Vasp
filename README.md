# Vasp

> Wasp magic for Vue — now with Bun + Elysia speed, Drizzle simplicity, full TypeScript support, and Nuxt 4 SSR/SSG.

Vasp is a batteries-included, declarative full-stack web framework for Vue developers. Write a single `main.vasp` configuration file and get a complete, production-ready application — backend, frontend, auth, database schema, realtime, and background jobs — all generated automatically.

---

## Why Vasp?

| Layer | Technology | Why |
|---|---|---|
| Runtime | **Bun** | Fastest JS runtime available |
| Backend | **Elysia** | Fastest framework on Bun |
| ORM | **Drizzle** | Lightest bundle, fastest queries |
| Frontend | **Vue 3 + Vite** (SPA) or **Nuxt 4** (SSR/SSG) | Best DX + SSR/SSG |
| HTTP Client | **ofetch** (`$vasp` composable) | Isomorphic, works in SPA, SSR, and Nitro with no shimming |
| Language | **JavaScript** (default) + **TypeScript** (opt-in) | Maximum flexibility |
| Config DSL | `.vasp` files | Single source of truth |

---

## Quick Start

```bash
# Install Vasp CLI
bun install -g vasp

# Create a new app (JavaScript + SPA, the fastest path)
vasp new my-app

# With TypeScript + SSR
vasp new my-app --typescript --ssr
```

That's it. Vasp generates your entire stack in under 5 seconds.

---

## The `.vasp` DSL

Every project starts with a single `main.vasp` file:

```vasp
app MyTodoApp {
  title: "Vasp Todo"
  db: Drizzle
  ssr: false        // false = SPA (default), true = SSR, "ssg" = Static Site Generation
  typescript: false // false = pure JS (default), true = TypeScript
}

auth User {
  userEntity: User
  methods: [ usernameAndPassword, google, github ]
}

route HomeRoute {
  path: "/"
  to: HomePage
}

page HomePage {
  component: import Home from "@src/pages/Home.vue"
}

query getTodos {
  fn: import { getTodos } from "@src/queries.js"
  entities: [Todo]
}

action createTodo {
  fn: import { createTodo } from "@src/actions.js"
  entities: [Todo]
}

crud Todo {
  entity: Todo
  operations: [list, create, update, delete]
}

realtime TodoChannel {
  entity: Todo
  events: [created, updated, deleted]
}

job sendWelcomeEmail {
  executor: PgBoss
  perform: {
    fn: import { sendWelcomeEmail } from "@src/jobs.js"
  }
}
```

Vasp reads this file and generates a complete full-stack application. You only write business logic — everything else is handled.

---

## Two Explicit Frontend Modes

Vasp generates one of two clearly distinct frontend targets based on the `ssr` flag.

### SPA Mode (`ssr: false`, default)
- Pure Vue 3 + Vite + Vue Router
- Auth guards via Vue Router `beforeEach` hooks
- Ideal for dashboards, admin panels, and authenticated apps

### SSR / SSG Mode (`ssr: true` or `ssr: "ssg"`)
- Full **Nuxt 4** project — `nuxt.config.ts`, Nitro engine, hybrid rendering
- File-based routing via `pages/`, typed server routes via `server/api/`
- Auth guards via Nuxt middleware (`defineNuxtRouteMiddleware`)
- SSG pre-renders at build time; SSR renders per-request via Nitro

Switch modes at any time:
```bash
vasp enable-ssr
```

---

## The `$vasp` Composable

All data access goes through a single isomorphic composable powered by **ofetch**:

```js
const { $vasp } = useVasp()

// Works identically in SPA, SSR server render, and SSG
const todos = await $vasp.query('getTodos')
await $vasp.action('createTodo', { text: 'Buy milk' })
```

In SSR mode, Vasp automatically calls server functions directly during server render (zero network round-trip) and switches to HTTP on the client after hydration. The developer sees one API regardless of mode.

---

## Generated Project Structure

```
my-app/
├── main.vasp               ← Your entire app declaration
├── src/
│   ├── pages/              ← Your Vue page components
│   ├── components/
│   ├── queries.js/.ts      ← Your query implementations
│   ├── actions.js/.ts      ← Your action implementations
│   ├── jobs.js/.ts         ← Your background job handlers
│   └── lib/
├── drizzle/
│   └── schema.js/.ts       ← Auto-generated Drizzle schema
├── nuxt/                   ← Only when ssr/ssg enabled
├── .vasp-gen/              ← All generated scaffolding (do not edit)
├── bunfig.toml
├── vite.config.js          ← or nuxt.config.ts when SSR/SSG
├── tsconfig.json           ← Only when typescript: true
└── package.json
```

---

## CLI Reference

```bash
vasp new <name> [--typescript] [--ssr] [--ssg] [--no-install]
vasp migrate-to-ts    # Upgrade an existing JS project to TypeScript
vasp enable-ssr       # Switch a SPA project to SSR/SSG
vasp start            # Start dev server (backend + frontend with hot reload)
vasp build            # Production build
vasp deploy           # Deploy to production
vasp --version
```

---

## Features

| Feature | Status |
|---|---|
| `.vasp` DSL parser + validator | Done |
| Code generator (all block types) | Done |
| SPA scaffold (Vue 3 + Vite) | Done |
| SSR/SSG scaffold (Nuxt 4) | Done |
| JavaScript and TypeScript | Done |
| Elysia backend generation | Done |
| Drizzle schema generation | Done |
| Auth (username/password, Google, GitHub) | Done |
| Queries and Actions | Done |
| CRUD endpoints | Done |
| Realtime (WebSocket channels) | Done |
| Background jobs (PgBoss) | Done |
| `vasp new` CLI command | Done |
| `vasp new --starter=<name>` | Done |
| `vasp migrate-to-ts` | Done |
| `vasp enable-ssr` | Done |
| `vasp start` dev server | Done |
| `vasp build` | Done |
| `vasp deploy` | Planned |

---

## Monorepo Structure

Vasp is a Bun monorepo with the following packages:

| Package | Description |
|---|---|
| `vasp` (CLI) | The `vasp` binary — `vasp new`, `vasp migrate-to-ts`, etc. |
| `@vasp-framework/parser` | Lexer, parser, and semantic validator for the `.vasp` DSL |
| `@vasp-framework/generator` | Generates Elysia backend, Vue/Nuxt frontend, and client SDK from a parsed AST |
| `@vasp-framework/core` | Shared types, AST definitions, and error classes |
| `@vasp-framework/runtime` | Runtime composables (`useVasp`, `$vasp`) shipped into generated apps |

---

## Development

**Prerequisites**: [Bun](https://bun.sh) >= 1.0

```bash
git clone https://github.com/your-org/vasp
cd vasp
bun install

# Run all tests
bun run test

# Run tests in watch mode
bun run test:watch

# Type check
bun run typecheck

# Build all packages
bun run build
```

Tests are written with [Vitest](https://vitest.dev) and cover the parser, semantic validator, generator, and template engine. E2E fixture files live in `e2e/fixtures/`.

---

## How It Works

1. **Parse** — The `.vasp` source is tokenized by the `Lexer` and parsed into a `VaspAST` by the `Parser`. The `SemanticValidator` then checks for semantic correctness (duplicate names, invalid references, etc.).

2. **Generate** — The `generate()` function walks the AST and runs a pipeline of specialized generators in dependency order:
   - `ScaffoldGenerator` → project skeleton and config files
   - `DrizzleSchemaGenerator` → Drizzle schema from entity declarations
   - `BackendGenerator` → Elysia server entry point
   - `AuthGenerator` → auth middleware and login/register routes
   - `QueryActionGenerator` → typed query and action endpoints
   - `CrudGenerator` → REST CRUD endpoints
   - `RealtimeGenerator` → WebSocket channels
   - `JobGenerator` → PgBoss background job wiring
   - `FrontendGenerator` → Vue 3 SPA (Vite) **or** Nuxt 4 SSR/SSG

   All output files are produced from [Handlebars](https://handlebarsjs.com) templates under `templates/`. There are four template trees: SPA+JS, SPA+TS, SSR+JS, SSR+TS.

3. **Run** — `bun` runs the generated backend and frontend simultaneously with hot reload.

---

## Security

Generated applications include production-grade defaults out of the box:
- CORS configuration
- Rate limiting
- Auth middleware
- Input validation
- CSRF protection (SSR mode)

---

## License

Apache License 2.0. See [LICENSE](LICENSE).
