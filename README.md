# Vasp

> One of the most AI-friendly full-stack blueprints available today — now with Bun + Elysia speed, Drizzle simplicity, full TypeScript support, and Nuxt 4 SSR/SSG.

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
bun install -g vasp-cli

# Create a new app — interactive prompts guide you through TypeScript, SSR and starter selection
vasp new my-app

# Or pass flags directly to skip prompts
vasp new my-app --typescript --ssr
vasp new my-app --starter=todo
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
  env: {
    DATABASE_URL: required
    JWT_SECRET: required
    GOOGLE_CLIENT_ID: optional
  }
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

entity Todo {
  id: Int @id
  title: String
  done: Boolean
  createdAt: DateTime @default(now)
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
  schedule: "0 * * * *"
}

admin {
  entities: [Todo, User]
}
```

Vasp reads this file and generates a complete full-stack application. You only write business logic — everything else is handled.

---

## Admin Panel

Add an `admin` block to instantly generate a standalone **Ant Design Vue** admin panel wired to your CRUD endpoints:

```vasp
admin {
  entities: [Todo, User]
}
```

Vasp generates an `admin/` directory containing a full Vite + Vue 3 application:

- **Collapsible sidebar** with a route per entity and a dashboard overview
- **Per-entity CRUD table** — server-paginated, sortable, with inline Delete confirmation
- **Create / Edit modal** — form fields are automatically typed (`a-switch` for Boolean, `a-input-number` for Int/Float, `a-textarea` for Text, `a-input` for String, etc.)
- **Axios API client** per entity, proxied to your Elysia backend at `/api/crud`
- Supports both **JavaScript** and **TypeScript** (controlled by `app.typescript`)

Run the admin panel independently:

```bash
cd admin
bun install
bun run dev   # starts on port 5174
```

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

## Advanced DSL Features

### Field Modifiers

```vasp
entity Post {
  id:        Int      @id
  slug:      String   @unique
  title:     String   @validate(minLength: 1, maxLength: 255)
  email:     String   @validate(email)
  website:   String   @validate(url)
  score:     Float    @validate(min: 0, max: 100)
  body:      Text     @nullable
  meta:      Json     @nullable
  status:    Enum(draft, published, archived)
  avatar:    File     @storage(UserFiles)   // requires a storage block named UserFiles
  author:    User     @onDelete(cascade)    // cascade | restrict | setNull
  createdAt: DateTime @default(now)
  updatedAt: DateTime @updatedAt
}
```

### Entity-Level Indexes

```vasp
entity Product {
  id:    Int    @id
  sku:   String
  name:  String
  price: Float

  @@index([sku])                    // single-column index
  @@unique([sku])                   // single-column unique constraint
  @@index([name], type: fulltext)   // GIN full-text search index
}
```

### CRUD Nested Sub-Blocks (v2 DSL)

Inline field config and CRUD sub-blocks give you per-field UI metadata and rich list/form control without any extra code:

```vasp
entity Todo {
  id:    Int    @id
  title: String {
    label:       "Task Title"
    placeholder: "Enter a task name…"
    description: "The primary text of the todo item"
    validate {
      minLength: 3
      maxLength: 120
      required:  true
    }
  }
  priority: Enum(low, medium, high) {
    label:   "Priority"
    default: "medium"
  }
  done:      Boolean  { label: "Completed"  default: false }
  createdAt: DateTime @default(now)
}

crud Todo {
  entity:     Todo
  operations: [list, create, update, delete]

  list {
    paginate:   true
    sortable:   [title, createdAt, priority]
    filterable: [done, priority]
    search:     [title]

    columns {
      title    { label: "Task"     width: "40%"   sortable: true  }
      priority { label: "Priority" width: "120px" filterable: true }
      done     { label: "Done"     width: "80px"                  }
    }
  }

  form {
    layout: "2-column"   // 1-column | 2-column | tabs | steps

    sections {
      basics { label: "Basic Info"  fields: [title, priority] }
      status { label: "Status"      fields: [done]            }
    }
  }

  permissions {
    list:   [admin, user]
    create: [admin, user]
    update: [admin]
    delete: [admin]
  }
}
```

Upgrade an existing v1 file automatically:

```bash
vasp migrate           # creates main.vasp.bak, rewrites flat props to nested blocks
```

### CRUD List Configuration (legacy flat syntax still supported)

```vasp
crud Post {
  entity: Post
  operations: [list, create, update, delete]
  list: {
    paginate: true
    sortable: [createdAt, title]
    filterable: [status]
    search: [title, body]
  }
}
```

### Custom API Endpoints

```vasp
api webhookReceiver {
  method: POST
  path: "/api/webhooks/stripe"
  fn: import { handleStripeWebhook } from "@src/webhooks.js"
}

api adminStats {
  method: GET
  path: "/api/admin/stats"
  fn: import { getStats } from "@src/admin.js"
  auth: true
  roles: [admin]
}
```

### Custom Middleware

```vasp
middleware requestLogger {
  fn: import { logRequest } from "@src/middleware.js"
  scope: global   // global | route
}
```

### Query Caching

```vasp
cache QueryCache {
  provider: redis   // memory | redis | valkey
  ttl: 300          // default TTL in seconds
  redis: {
    url: REDIS_URL  // env var name holding the connection URL
  }
}

query getPublicPosts {
  fn: import { getPublicPosts } from "@src/queries.js"
  entities: [Post]
  cache: {
    store: QueryCache
    ttl: 600
    key: "public-posts"
    invalidateOn: ["Post:create", "Post:update", "Post:delete"]
  }
}
```

### Email

```vasp
email Mailer {
  provider: resend   // resend | sendgrid | smtp
  from: "noreply@myapp.com"
  templates: [
    { name: welcome; fn: import { welcomeEmail } from "@src/emails.js" }
  ]
}

action registerUser {
  fn: import { registerUser } from "@src/actions.js"
  entities: [User]
  onSuccess: {
    sendEmail: welcome
  }
}
```

### File Storage

```vasp
storage UserFiles {
  provider: s3     // local | s3 | r2 | gcs
  bucket: my-bucket
  maxSize: "10mb"
  allowedTypes: ["image/jpeg", "image/png"]
  publicPath: "/uploads"
}
```

### Database Seeding

```vasp
seed {
  fn: import { seed } from "@src/seed.js"
}
```

Run with `vasp db seed`.

### Typed Environment Variables

```vasp
app MyApp {
  title: "My App"
  db: Drizzle
  ssr: false
  typescript: true
  env: {
    DATABASE_URL:    required String
    JWT_SECRET:      required String @minLength(32)
    PORT:            optional Int    @default(3001)
    NODE_ENV:        optional Enum(development, production, test) @default(development)
    ALLOWED_ORIGINS: optional String @startsWith("https://")
  }
}
```

### Multi-Tenancy

```vasp
app MyApp {
  title: "SaaS App"
  db: Drizzle
  ssr: false
  typescript: true
  multiTenant: {
    strategy: row-level       // row-level | schema-level | database-level
    tenantEntity: Workspace
    tenantField: workspaceId
  }
}
```

### Role-Based Access Control

```vasp
auth UserAuth {
  userEntity: User
  methods: [usernameAndPassword]
  roles: [admin, editor, viewer]
  permissions: {
    "post:create": [admin, editor]
    "post:delete": [admin]
    "post:read":   [admin, editor, viewer]
  }
}

query getPosts {
  fn: import { getPosts } from "@src/queries.js"
  entities: [Post]
  auth: true
  roles: [admin, editor]
}

crud Post {
  entity: Post
  operations: [list, create, update, delete]
  permissions: {
    list:   "post:read"
    create: "post:create"
    update: "post:create"
    delete: "post:delete"
  }
}
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

In SSR mode, a single universal Nuxt plugin (`plugins/vasp.js`) handles both server and client. During SSR renders the plugin forwards the incoming request cookies to the Elysia backend via `useRequestHeaders`, so the user session is preserved. On the client after hydration, cookies are sent via `credentials: 'include'`. The developer sees one API regardless of mode.

### `useAuth()` Composable

Reactive authentication composable. Auto-fetches the current user on creation:

```js
import { useAuth } from '@vasp-framework/runtime'

const { user, isAuthenticated, login, register, logout } = useAuth()
```

Returns reactive `user`, `loading`, `error`, `isAuthenticated`, and methods for `login()`, `register()`, `logout()`, and `refresh()`.

---

## Generated Project Structure

```
my-app/
├── main.vasp               ← Your entire app declaration
├── vasp.config.ts          ← Optional plugin configuration (custom generators, template overrides)
├── README.md               ← Project documentation
├── .env                    ← Working environment config
├── .env.example            ← Template for environment variables
├── src/
│   ├── pages/              ← Your Vue page components
│   ├── components/
│   ├── queries.js/.ts      ← Your query implementations
│   ├── actions.js/.ts      ← Your action implementations
│   ├── jobs.js/.ts         ← Your background job handlers
│   └── lib/
├── server/                 ← Generated Elysia backend
│   ├── index.{js|ts}
│   ├── middleware/
│   │   └── rateLimit.{js|ts}
│   ├── db/
│   │   └── client.{js|ts}
│   └── routes/
│       ├── queries/
│       ├── actions/
│       ├── crud/
│       ├── realtime/
│       └── jobs/
├── drizzle/
│   └── schema.js/.ts       ← Auto-generated Drizzle schema
├── admin/                  ← Only when admin block is present
│   ├── package.json        ← Vue 3 + Ant Design Vue + Pinia + Vite
│   ├── index.html
│   ├── vite.config.js/.ts
│   └── src/
│       ├── main.js/.ts
│       ├── App.vue
│       ├── router/
│       ├── layouts/        ← AdminLayout (collapsible sidebar)
│       ├── views/          ← Per-entity CRUD pages + FormModal
│       └── api/            ← Per-entity axios clients
├── nuxt/                   ← Only when ssr/ssg enabled
├── bunfig.toml
├── vite.config.js          ← or nuxt.config.ts when SSR/SSG
├── tsconfig.json           ← Only when typescript: true
└── package.json
```

---

## CLI Reference

```bash
vasp new <name> [--typescript] [--ssr] [--ssg] [--starter=<name>] [--no-install]
                              # Interactive prompts shown when no flags are provided
vasp add entity <Name>        # Add an entity block + Drizzle column
vasp add page   <Name>        # Add a page + route + Vue component stub
vasp add crud   <Entity>      # Add CRUD endpoints for an entity
vasp add query  <name>        # Add a query block + function stub
vasp add action <name>        # Add an action block + function stub
vasp add job    <name>        # Add a background job + function stub
vasp add auth                 # Add auth block (+ User entity if missing)
vasp add api    <name>        # Add a custom API endpoint + handler stub
vasp generate [--force] [--dry-run]   # Regenerate from main.vasp (preserves user changes)
vasp validate [--watch] [--strict]    # Validate main.vasp without generating
vasp start            # Start dev server (auto-migrates schema, opens browser)
vasp build            # Production build
vasp db push          # Push schema to database
vasp db generate      # Generate a migration
vasp db migrate       # Run pending migrations
vasp db studio        # Open Drizzle Studio
vasp db seed          # Seed the database
vasp migrate          # Upgrade v1 .vasp file to v2 nested DSL syntax
vasp migrate-to-ts    # Upgrade an existing JS project to TypeScript
vasp enable-ssr       # Switch a SPA project to SSR/SSG
vasp deploy --target=<docker|fly|railway>   # Generate deployment config files
vasp eject            # Remove Vasp framework dependency (one-way)
vasp --version
```

---

## Features

| Feature | Status |
|---|---|
| `.vasp` DSL parser + validator | Done |
| Code generator (all block types) | Done |
| Entity DSL with typed fields & modifiers | Done |
| SPA scaffold (Vue 3 + Vite) | Done |
| SSR/SSG scaffold (Nuxt 4) | Done |
| JavaScript and TypeScript | Done |
| Elysia backend generation | Done |
| Drizzle schema generation (entity-aware) | Done |
| Auth (username/password, Google, GitHub) | Done |
| `useAuth()` composable | Done |
| Queries and Actions | Done |
| CRUD endpoints (with pagination/sorting) | Done |
| Realtime (WebSocket with auth & rooms) | Done |
| Background jobs (PgBoss, BullMQ with cron scheduling) | Done |
| Auto-generated pages (`autoPage` block — list/form/detail powered by PrimeVue 4) | Done |
| Admin panel generation (Ant Design Vue, per-entity CRUD UI) | Done |
| `vasp new` CLI command | Done |
| `vasp new` interactive prompts (TypeScript / SSR / starter) | Done |
| `vasp new --starter=<name>` | Done |
| `vasp add` — incremental block scaffolding (8 sub-commands) | Done |
| `vasp db` commands | Done |
| `vasp migrate-to-ts` | Done |
| `vasp enable-ssr` | Done |
| Rate limiting (IP-based, configurable) | Done |
| `app.env` schema + startup env validation | Done |
| Pre-flight checks in `vasp start` | Done |
| Auto-generated `.env` and `README.md` | Done |
| `vasp generate` (safe regeneration with manifest) | Done |
| `vasp start` dev server (schema auto-migration, browser auto-open) | Done |
| `vasp build` | Done |
| `vasp deploy` (Docker, Fly.io, Railway) | Done |
| `vasp eject` (remove framework dependency) | Done |
| OpenAPI / Swagger UI (`/api/docs`) | Done |
| Entity relations (foreign keys + Drizzle relations) | Done |
| Enum field type | Done |
| Rich field modifiers (`@nullable`, `@default`, `@updatedAt`) | Done |
| Valibot validation schemas (server + client) | Done |
| Structured error envelope (`{ ok, data, error }`) | Done |
| Request tracing + dev logger | Done |
| Test scaffold generation (Vitest) | Done |
| File storage (`storage` block — S3, R2, GCS, local) | Done |
| Email (`email` block — Resend, SendGrid, SMTP) | Done |
| Query caching (`cache` block — memory, Redis, Valkey) | Done |
| Custom API endpoints (`api` block) | Done |
| Custom middleware (`middleware` block — global/route scope) | Done |
| Database seeding (`seed` block) | Done |
| Multi-tenancy (row-level, schema-level, database-level) | Done |
| Role-based access control (roles + permissions on auth/query/action/crud) | Done |
| Field validation (`@validate` — email, url, uuid, minLength, maxLength, min, max) | Done |
| Entity-level indexes (`@@index`, `@@unique`, fulltext) | Done |
| v2 DSL nested entity field config (`label`, `placeholder`, `validate {}`) | Done |
| v2 DSL nested CRUD sub-blocks (`list {}`, `form {}`, `columns {}`, `sections {}`, `steps {}`) | Done |
| `vasp migrate` — auto-upgrade v1 → v2 DSL syntax | Done |
| Plugin system (`vasp.config.ts` — custom generators, template overrides, Handlebars helpers) | Done |
| VS Code extension (syntax highlighting, snippets, diagnostics, completions, hover, go-to-definition) | Done |
| Language server (`@vasp-framework/language-server` — real-Lexer-based LSP, multi-file workspace) | Done |

---

## VS Code Extension

Install the Vasp VS Code extension for first-class editor support:

```bash
# Install from the VS Code Marketplace (once published)
code --install-extension vasp-framework.vasp-vscode

# Or install from a locally built .vsix (see packages/vscode-extension/README.md)
code --install-extension vasp-vscode-0.1.0.vsix
```

**Features:**

| Feature | Details |
|---------|---------|
| Syntax highlighting | All 20 block types, `@modifiers`, primitive/executor/provider types, strings, booleans |
| Code snippets | 22 snippets with tab-stops for every block type |
| Diagnostics | Real-time parse errors + semantic validation (300 ms debounce) |
| Completions | 15 context states — entity names, page names, executor/provider enums with auto-insert snippets |
| Hover docs | Inline Markdown documentation for every keyword |
| Go-to-Definition | Jump to entity/page declarations across all `.vasp` files in the workspace |

**Building the extension from source:**

```bash
# 1. Build the language server
cd packages/language-server && bun run build

# 2. Build the extension host
cd packages/vscode-extension && bun run build

# 3. Copy the language server into the extension directory
mkdir -p packages/vscode-extension/language-server
cp -r packages/language-server/dist packages/vscode-extension/language-server/dist

# 4. Package as .vsix
cd packages/vscode-extension && npx @vscode/vsce package

# 5. Install
code --install-extension packages/vscode-extension/vasp-vscode-0.1.0.vsix
```

See [`packages/vscode-extension/README.md`](packages/vscode-extension/README.md) for the complete build guide including dev-mode F5 launch config and Marketplace publishing instructions.

---

## Monorepo Structure

Vasp is a Bun monorepo with the following packages:

| Package | Description |
|---|---|
| `vasp` (CLI) | The `vasp` binary — `vasp new`, `vasp migrate`, `vasp migrate-to-ts`, etc. |
| `@vasp-framework/parser` | Lexer, parser, and semantic validator for the `.vasp` DSL (v2 nested syntax) |
| `@vasp-framework/generator` | Generates Elysia backend, Vue/Nuxt frontend, and client SDK from a parsed AST |
| `@vasp-framework/core` | Shared types, AST definitions, and error classes |
| `@vasp-framework/runtime` | Runtime composables (`useVasp`, `useQuery`, `useAction`, `useAuth`) shipped into generated apps |
| `@vasp-framework/language-server` | LSP server — diagnostics, completions, hover, go-to-definition |
| `vasp-vscode` | VS Code extension — syntax highlighting, snippets, LSP client |

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
   - `DrizzleSchemaGenerator` → Drizzle schema from entity declarations (typed columns, enums, relations)
   - `BackendGenerator` → Elysia server entry point, rate-limit/CSRF middleware, startup env validation
   - `ObservabilityGenerator` → OpenTelemetry tracing, Prometheus/OTLP metrics, structured logging, error tracking
   - `AuthGenerator` → JWT auth middleware, login/register routes, Login/Register Vue components
   - `MiddlewareGenerator` → custom middleware blocks (global or route-scoped)
   - `CacheGenerator` → cache store setup (memory, Redis, Valkey)
   - `QueryActionGenerator` → typed query and action endpoints
   - `ApiGenerator` → custom API endpoints
   - `CrudGenerator` → REST CRUD endpoints with pagination, sorting, filtering
   - `RealtimeGenerator` → WebSocket channels with auth and room broadcasting
   - `AutoPageGenerator` → list/form/detail pages from `autoPage` blocks (PrimeVue 4)
   - `JobGenerator` → PgBoss/BullMQ/RedisStreams/RabbitMQ/Kafka background job wiring and cron scheduling
   - `EmailGenerator` → email provider setup (Resend, SendGrid, SMTP)
   - `SeedGenerator` → database seed script
   - `StorageGenerator` → file upload endpoints (S3, R2, GCS, local)
   - `WebhookGenerator` → inbound webhook receivers + outbound CRUD event dispatchers
   - `FrontendGenerator` → Vue 3 SPA (Vite) **or** Nuxt 4 SSR/SSG
   - `AdminGenerator` → standalone Ant Design Vue admin panel (when `admin` block is present)

   All output files are produced from [Handlebars](https://handlebarsjs.com) templates under `templates/`. There are four frontend template trees (SPA+JS, SPA+TS, SSR+JS, SSR+TS) plus a shared backend tree and an admin tree.

3. **Run** — `bun` runs the generated backend and frontend simultaneously with hot reload.

---

## Plugin System

Vasp's code-generation pipeline is fully extensible without forking the monorepo. Create a `vasp.config.ts` (or `vasp.config.js`) at your project root and export a `plugins` array. `vasp generate` and `vasp start` load this file automatically.

```typescript
// vasp.config.ts
import type { VaspPlugin } from "@vasp-framework/core";

const myPlugin: VaspPlugin = {
  name: "acme-plugin",

  // 1. Custom generators — run after all 19 built-in generators
  generators: [
    {
      name: "VersionFileGenerator",
      run(ctx, write) {
        // ctx exposes the parsed AST and output-mode flags (isTypeScript, isSpa, etc.)
        write(
          `src/version.${ctx.ext}`,
          `export const APP_TITLE = "${ctx.ast.app?.title}";\n`,
        );
      },
    },
  ],

  // 2. Template overrides — replace any built-in Handlebars template
  templateOverrides: {
    // Key = path relative to templates/ root; value = raw .hbs source
    "shared/server/index.hbs": `// My company's custom Elysia entry\n{{appName}}`,
  },

  // 3. Custom Handlebars helpers — available in all templates (including overrides)
  helpers: {
    shout: (str: unknown) => String(str).toUpperCase() + "!!!",
  },
};

export default { plugins: [myPlugin] };
```

### Extension points

| Extension | How it works |
|-----------|-------------|
| `generators` | Array of `{ name, run(ctx, write) }` objects. Each runs **after** all built-in generators. Use the `write(relativePath, content)` callback to emit files — it records every file in the manifest so incremental generation and orphan-deletion stay consistent. |
| `templateOverrides` | A `Record<string, string>` where keys are template paths relative to the `templates/` root (e.g. `"shared/server/index.hbs"`) and values are raw Handlebars source strings. Overrides take effect after the built-in template directory is loaded, so they win over defaults. All built-in template data (`appName`, `isTypeScript`, entity lists, etc.) is available in overridden templates. |
| `helpers` | A `Record<string, fn>` of custom Handlebars helpers registered before any template is rendered. Keys become helper names (e.g. `"shout"` → `{{shout name}}`). The trailing Handlebars options object is stripped automatically so your function receives only the declared arguments. |

### Plugin generator context

```typescript
interface PluginGeneratorContext {
  ast: VaspAST;        // fully-parsed main.vasp
  projectDir: string;  // absolute path to the real project directory
  isTypeScript: boolean;
  isSsr: boolean;
  isSsg: boolean;
  isSpa: boolean;
  ext: "ts" | "js";   // file extension for generated source files
}
```

### Security

The `write` callback validates that `relativePath` resolves inside the project directory — path-traversal attempts (e.g. `../../etc/passwd`) are rejected with an error.

---

## Security

Generated applications include production-grade defaults out of the box:
- **CORS** — Configurable cross-origin resource sharing via `@elysiajs/cors`
- **Rate limiting** — IP-based sliding-window limiter (configurable via `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS` env vars, defaults to 100 requests per 60 seconds)
- **CSRF protection** — CSRF middleware generated in `server/middleware/csrf.{js|ts}`
- **Password hashing** — Argon2id via `Bun.password.hash()` for auth password storage
- **Auth middleware** — JWT-based authentication with cookie transport
- **Input validation** — Elysia type-safe body/query validation on CRUD endpoints
- **Startup env validation** — typed `app.env` declarations checked at server startup with clear error messages

---

## License

Apache License 2.0. See [LICENSE](LICENSE).
