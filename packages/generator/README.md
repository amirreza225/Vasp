# @vasp-framework/generator

Handlebars-based code generator for Vasp. Takes a `VaspAST` and writes a complete, production-ready full-stack project to disk.

**Version: 1.5.1**

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
})

console.log(result.success)        // true
console.log(result.filesWritten)   // ['package.json', 'server/index.js', ...]
console.log(result.errors)         // [] on success
```

## Generator Pipeline

16 generators run in dependency order (defined in `generate.ts`):

| # | Generator | Output |
|---|---|---|
| 1 | `ScaffoldGenerator` | `package.json`, `.gitignore`, `.env`, `.env.example`, `bunfig.toml`, `tsconfig.json` |
| 2 | `DrizzleSchemaGenerator` | `drizzle/schema.{js\|ts}` — typed columns, enums, relations, indexes from `entity` blocks |
| 3 | `BackendGenerator` | `server/index.{js\|ts}` (Elysia entry + `/api/health`), `server/middleware/` (rateLimit, CSRF, errorHandler, logger), DB client, startup env validation for `app.env` |
| 4 | `AuthGenerator` | Auth routes, JWT middleware plugin, `Login.vue`, `Register.vue` |
| 5 | `MiddlewareGenerator` | `server/middleware/custom/` — one file per `middleware` block |
| 6 | `CacheGenerator` | `server/cache/` — cache store setup (memory / Redis / Valkey) |
| 7 | `QueryActionGenerator` | `server/routes/queries/`, `server/routes/actions/` |
| 8 | `ApiGenerator` | `server/routes/api/` — one file per `api` block |
| 9 | `CrudGenerator` | `server/routes/crud/` + client CRUD helpers |
| 10 | `RealtimeGenerator` | `server/routes/realtime/` + `useRealtime` composable |
| 11 | `JobGenerator` | `server/jobs/` (PgBoss workers) + schedule endpoints |
| 12 | `EmailGenerator` | `server/email/` — provider setup (Resend, SendGrid, SMTP) + mailer helpers |
| 13 | `SeedGenerator` | `server/db/seed.{js\|ts}` — wraps the user-supplied seed function |
| 14 | `StorageGenerator` | `server/routes/storage/` — file upload endpoints (S3, R2, GCS, local) |
| 15 | `FrontendGenerator` | Vue 3 + Vite (SPA) **or** Nuxt 4 (SSR/SSG) frontend |
| 16 | `AutoPageGenerator` | `pages/<path>.vue` — list/form/detail pages from `autoPage` blocks (PrimeVue 4) |
| 17 | `AdminGenerator` | `admin/` — standalone Ant Design Vue admin panel (only when `admin` block present) |

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

## License

[Apache 2.0](https://github.com/amirreza225/Vasp/blob/main/LICENSE)
