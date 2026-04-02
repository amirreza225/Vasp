# @vasp-framework/generator

Handlebars-based code generator for Vasp. Takes a `VaspAST` and writes a complete, production-ready full-stack project to disk.

**Version: 1.5.2**

This is an internal package used by `vasp-cli`. You don't need to install it unless you're building custom Vasp tooling.

## Usage

```typescript
import { generate } from '@vasp-framework/generator'
import { parse } from '@vasp-framework/parser'

const ast = parse(source)

const result = generate(ast, {
  outputDir: '/path/to/my-app',
  templateDir: '/path/to/templates', // optional, defaults to bundled templates
  logLevel: 'info',                  // 'silent' | 'info' | 'verbose'
  plugins: [],                       // optional — see Plugin System below
})

console.log(result.success)        // true
console.log(result.filesWritten)   // ['package.json', 'server/index.js', ...]
console.log(result.errors)         // [] on success
```

## Generator Pipeline

19 generators run in dependency order (defined in `generate.ts`):

| # | Generator | Output |
|---|---|---|
| 1 | `ScaffoldGenerator` | `package.json`, `.gitignore`, `.env`, `.env.example`, `bunfig.toml`, `tsconfig.json` |
| 2 | `DrizzleSchemaGenerator` | `drizzle/schema.{js\|ts}` — typed columns, enums, relations, indexes from `entity` blocks |
| 3 | `BackendGenerator` | `server/index.{js\|ts}` (Elysia entry + `/api/health`), `server/middleware/` (rateLimit, CSRF, errorHandler, logger), DB client, startup env validation for `app.env` |
| 4 | `ObservabilityGenerator` | OpenTelemetry tracing, Prometheus/OTLP metrics, structured logging, error tracking (Sentry/Datadog) |
| 5 | `AuthGenerator` | Auth routes, JWT middleware plugin, `Login.vue`, `Register.vue` |
| 6 | `MiddlewareGenerator` | `server/middleware/custom/` — one file per `middleware` block |
| 7 | `CacheGenerator` | `server/cache/` — cache store setup (memory / Redis / Valkey) |
| 8 | `QueryActionGenerator` | `server/routes/queries/`, `server/routes/actions/` |
| 9 | `ApiGenerator` | `server/routes/api/` — one file per `api` block |
| 10 | `CrudGenerator` | `server/routes/crud/` + client CRUD helpers |
| 11 | `RealtimeGenerator` | `server/routes/realtime/` + `useRealtime` composable |
| 12 | `AutoPageGenerator` | `pages/<path>.vue` — list/form/detail pages from `autoPage` blocks (PrimeVue 4) |
| 13 | `JobGenerator` | `server/jobs/` (PgBoss/BullMQ/RedisStreams/RabbitMQ/Kafka workers) + schedule endpoints |
| 14 | `EmailGenerator` | `server/email/` — provider setup (Resend, SendGrid, SMTP) + mailer helpers |
| 15 | `SeedGenerator` | `server/db/seed.{js\|ts}` — wraps the user-supplied seed function |
| 16 | `StorageGenerator` | `server/routes/storage/` — file upload endpoints (S3, R2, GCS, local) |
| 17 | `WebhookGenerator` | Inbound webhook receivers + outbound CRUD event dispatchers |
| 18 | `FrontendGenerator` | Vue 3 + Vite (SPA) **or** Nuxt 4 (SSR/SSG) frontend |
| 19 | `AdminGenerator` | `admin/` — standalone Ant Design Vue admin panel (only when `admin` block present) |

A failure in any generator aborts the pipeline and leaves the real output directory untouched (see Safe Regeneration below).

## Template Trees

Six separate template trees — no unified template with `{{#if isSsr}}` blocks:

```
templates/
├── shared/          # Backend, auth, CRUD, realtime, jobs, cache, storage, email (mode-agnostic)
├── admin/           # Standalone Ant Design Vue admin panel
├── starters/        # Pre-built example .vasp files (minimal, todo, recipe, todo-auth-ssr)
├── spa/
│   ├── js/          # Vue 3 + Vite, JavaScript
│   └── ts/          # Vue 3 + Vite, TypeScript
└── ssr/
    ├── js/          # Nuxt 4, JavaScript
    └── ts/          # Nuxt 4, TypeScript
```

**Note:** `packages/cli/templates/` is a **build artifact** (`cp -r ../../templates` during `bun run build`). Always edit templates in `templates/` at the monorepo root.

## Safe Regeneration

`generate()` writes to a temporary `.vasp-staging-<timestamp>` directory first, then atomically commits to the real output directory only on full success. On any error the staging directory is deleted and the real output directory is untouched.

The `Manifest` class tracks which generator wrote each file and a content hash. On regeneration:
- Files modified by the user (hash mismatch + not from Vasp generator) are preserved
- `.env` is preserved if it contains non-placeholder values
- Stale generated files (from removed DSL blocks) are deleted

When a generator silently fails (e.g. early `BackendGenerator` error prevents later generators from running), check `result.errors` — tests pass `logLevel: 'silent'` so errors are not printed to stdout.

## Plugin System

`generate()` accepts an optional `plugins` array that lets you extend the pipeline without forking the monorepo.

### Custom generators

```typescript
import { generate } from '@vasp-framework/generator'
import type { VaspPlugin } from '@vasp-framework/core'

const plugin: VaspPlugin = {
  name: 'my-plugin',
  generators: [
    {
      name: 'VersionFileGenerator',
      run(ctx, write) {
        // ctx: { ast, projectDir, isTypeScript, isSpa, isSsr, isSsg, ext }
        write(`src/version.${ctx.ext}`, `export const VERSION = "${ctx.ast.app?.title}";\n`)
      },
    },
  ],
}

const result = generate(ast, { outputDir, plugins: [plugin] })
```

Plugin generators run **after** all built-in generators. The `write(relativePath, content)` callback records every emitted file in the manifest so incremental generation and orphan-deletion stay consistent. A path-traversal guard rejects any path that escapes the output directory.

### Template overrides

Replace any built-in Handlebars template by its key (relative to the `templates/` root):

```typescript
const plugin: VaspPlugin = {
  name: 'my-plugin',
  templateOverrides: {
    'shared/server/index.hbs': '// My custom Elysia entry\n{{appName}}',
  },
}
```

Overrides are applied **after** `engine.loadDirectory()`, so they win over defaults. All standard template data (`appName`, `isTypeScript`, entity lists, etc.) is available.

### Custom Handlebars helpers

```typescript
const plugin: VaspPlugin = {
  name: 'my-plugin',
  helpers: {
    shout: (str: unknown) => String(str).toUpperCase() + '!!!',
    // Usage in any .hbs template: {{shout appName}}
  },
}
```

Helpers are registered before any template is rendered. The trailing Handlebars options object is stripped automatically; block helpers (`{{#helper}}`) are not supported via this API.

### `TemplateEngine` public API

For advanced use cases you can obtain and manipulate the engine directly:

```typescript
import { TemplateEngine } from '@vasp-framework/generator'

const engine = new TemplateEngine()
engine.loadDirectory('/path/to/templates')

// Register a helper manually
engine.registerHelper('shout', (str: unknown) => String(str).toUpperCase() + '!!!')

// Override a template
engine.applyTemplateOverride('shared/server/index.hbs', '{{appName}} custom entry')

// Pass the pre-built engine to generate() to avoid re-compilation costs
const result = generate(ast, { outputDir, engine })
```

## License

[Apache 2.0](https://github.com/amirreza225/Vasp/blob/main/LICENSE)
