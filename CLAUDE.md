# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Vasp is a declarative full-stack framework for Vue developers. A single `main.vasp` config file generates a complete production-ready app: Elysia backend, Vue 3 SPA (Vite) or Nuxt 4 SSR/SSG frontend, Drizzle ORM schema, auth, realtime, and background jobs.

**Current mission**: Evolve Vasp from “excellent MVP generator” into a **mature, enterprise-grade declarative framework** that an LLM (like you) can confidently use to build complex, scalable, long-lived SaaS platforms with 100k+ users, compliance requirements, and multi-developer teams.

## Commands

```bash
# Build & check
bun run build                  # Build all packages in dependency order (core → parser → generator → runtime → cli)
bun run typecheck              # tsc --noEmit across all packages
bun run lint                   # ESLint on packages/*/src/**/*.ts
bun run check:exhaustiveness   # Verify PrimitiveFieldType and VaspNode switch coverage

# Tests
bun run test                   # Vitest unit/integration tests
bun run test:watch             # Watch mode
bun run test:coverage          # Coverage via v8
bun run test:e2e               # E2E: spawns CLI as subprocess against fixtures in e2e/fixtures/
bun run test:browser           # Playwright browser tests (requires bun run build first)

# Run a single test file
bun run test packages/parser/src/parser/Parser.test.ts

# Build CLI binary only
cd packages/cli && bun run build   # Output: dist/vasp

# Build language server
cd packages/language-server && bun run build   # Output: dist/server.js

# Build VS Code extension
cd packages/vscode-extension && bun run build  # Output: dist/extension.js

# Package VS Code extension as .vsix
mkdir -p packages/vscode-extension/language-server
cp -r packages/language-server/dist packages/vscode-extension/language-server/dist
cd packages/vscode-extension && npx @vscode/vsce package
# → vasp-vscode-0.1.0.vsix

# Install the .vsix into VS Code
code --install-extension packages/vscode-extension/vasp-vscode-0.1.0.vsix
```

A stop hook (`.claude/hooks/stop-check.sh`) runs automatically on session end: TSC, Handlebars validation, JSON validation, Prettier, and Knip. It outputs `decision: block` if errors are found — fix them before finishing.

## Architecture

### Three-Phase Pipeline

1. **Parse** — `.vasp` source → `Lexer` → `Parser` → AST → `SemanticValidator`
2. **Generate** — AST walk → 19 generators in order → Handlebars template rendering → staging dir
3. **Commit** — Staged files committed to real output dir (preserves `.env`, removes stale files)

### Monorepo Packages

| Package | npm name | Purpose |
|---------|----------|---------|
| `packages/core` | `@vasp-framework/core` | `VaspAST` types, errors, constants — source of truth |
| `packages/parser` | `@vasp-framework/parser` | `Lexer`, `Parser`, `SemanticValidator` |
| `packages/generator` | `@vasp-framework/generator` | 19 generators + `TemplateEngine` (Handlebars) |
| `packages/runtime` | `@vasp-framework/runtime` | `$vasp`/`useQuery`/`useAction`/`useAuth` composables shipped into generated apps |
| `packages/cli` | `vasp-cli` | CLI commands (`vasp new`, `vasp generate`, `vasp migrate`, `vasp start`, etc.) |
| `packages/language-server` | `@vasp-framework/language-server` | Real-Lexer-based LSP server — diagnostics, completions, hover, go-to-definition for `.vasp` files |
| `packages/vscode-extension` | `vasp-vscode` | VS Code extension — TextMate grammar, snippets, LSP client |

### Generator Execution Order

Defined in `packages/generator/src/generate.ts`:

1. `ScaffoldGenerator` — package.json, tsconfig, .env, README
2. `DrizzleSchemaGenerator` — DB schema (entities, enums, relations)
3. `BackendGenerator` — Elysia server entry, DB client, middleware, Swagger
4. `ObservabilityGenerator` — OpenTelemetry tracing, Prometheus/OTLP metrics, structured logging, error tracking (Sentry/Datadog)
5. `AuthGenerator` — auth routes + Login/Register Vue components
6. `MiddlewareGenerator` — custom middleware blocks
7. `CacheGenerator` — cache store setup (memory/Redis/Valkey)
8. `QueryActionGenerator` — query/action server handlers
9. `ApiGenerator` — custom API endpoints
10. `CrudGenerator` — REST CRUD endpoints
11. `RealtimeGenerator` — WebSocket channels
12. `AutoPageGenerator` — list/form/detail pages from `autoPage` blocks (PrimeVue 4)
13. `JobGenerator` — PgBoss/BullMQ/RedisStreams/RabbitMQ/Kafka background jobs
14. `EmailGenerator` — email provider setup
15. `SeedGenerator` — DB seed script
16. `StorageGenerator` — file upload endpoints
17. `WebhookGenerator` — inbound webhook receivers + outbound CRUD event dispatchers
18. `FrontendGenerator` — Vue SPA (Vite) or Nuxt 4 SSR/SSG
19. `AdminGenerator` — standalone Vue 3 + Ant Design admin panel

All generators extend `BaseGenerator`. `baseData()` exposes the following to every template: `appName`, `appTitle`, `isTypeScript`, `isSsr`, `isSsg`, `isSpa`, `ext`, `mode`, `hasAuth`, `hasAdmin`, `adminEntities`, `hasAnyRelations`, `hasRealtime`, `hasJobs`, `hasPgBossJobs`, `hasBullMQJobs`, `hasRedisStreamsJobs`, `hasRabbitMQJobs`, `hasKafkaJobs`, `hasRedisJobs`, `hasStorage`, `storages`, `hasEmail`, `hasEmailResend`, `hasEmailSendgrid`, `hasEmailSmtp`, `emails`, `hasCache`, `caches`, `hasCacheRedis`, `needsRedis`, `hasWebhook`, `hasInboundWebhook`, `hasOutboundWebhook`, `webhooks`, `inboundWebhooks`, `outboundWebhooks`, `routes`, `pages`, `queries`, `actions`, `apis`, `middlewares`, `cruds`, `hasCrudListConfig`, `hasCrudFormConfig`, `realtimes`, `jobs`, `seed`, `auth`, `multiTenant`, `hasMultiTenant`, `isRowLevelTenant`, `observability`, `hasObservability`, `hasObservabilityTracing`, `hasObservabilityMetrics`, `observabilityLogs`, `observabilityExporter`, `observabilityErrorTracking`, `hasObservabilityOtlp`, `hasObservabilityPrometheus`, `hasObservabilitySentry`, `hasObservabilityDatadog`, `hasStructuredLogs`, `autoPages`, `hasAutoPages`, `ui`. `GeneratorContext` carries `{ ast, outputDir, templateDir, isTypeScript, isSsr, isSsg, isSpa, mode, ext, logger }`.

### Template System

Templates live in `templates/` (monorepo root), organized as:
- `templates/shared/` — generated for all modes (server, auth, drizzle, jobs, middleware)
- `templates/spa/{js,ts}/` — Vite SPA only
- `templates/ssr/{js,ts}/` — Nuxt 4 SSR/SSG only
- `templates/admin/` — standalone admin panel
- `templates/starters/` — pre-built example `.vasp` files

**`packages/cli/templates/` is a build artifact** — created by `cp -r ../../templates` during `bun run build`. It is gitignored. Always edit templates in `templates/` (root).

Handlebars custom helpers: `camelCase`, `pascalCase`, `kebabCase`, `join`, `importPath`, `importName`, `eq`, `includes`.

The `importPath` helper rewrites `@src/foo.js` → `@src/foo.ts` when `isTypeScript` is true — never hard-code `.ts` in templates.

**Critical Handlebars `}}}` trap** — When a `{{expr}}` expression is immediately followed by `}` (common inside JavaScript `${...}` template literals), the sequence `{{expr}}}` contains three consecutive `}`. Handlebars' lexer greedily tokenises `}}}` as `CLOSE_UNESCAPED` (the `{{{triple-mustache}}}` token) instead of `CLOSE` (`}}`) + text `}`. The template **compiles silently** but **fails at render time** with `Parse error … got 'CLOSE_UNESCAPED'`. Use string concatenation to avoid the pattern:

```hbs
{{! ❌ breaks: produces {{name}}} }}
_errors.push(`must be integer (got "${process.env.{{name}}}")`)

{{! ✅ safe: no triple-brace sequence }}
_errors.push('must be integer (got "' + process.env.{{name}} + '")')
```

This only occurs when `}}` and `}` are **adjacent** — `{{name}}.length}` (a property access before the closing `}`) is safe.

## Key Conventions

**ESM imports require `.js` extension** even when the source is `.ts`:
```ts
import { Parser } from './Parser.js'   // ✅
import { Parser } from './Parser'      // ❌ breaks ESM resolution
```

**File extensions in generated output** — use `.{ext}` (from `ctx.ext`), not `.ts` or `.js` directly.

**Workspace deps** — use `workspace:*` in `package.json`. Never reference `@vasp-framework/*` packages with hardcoded versions inside the monorepo.

**Template path resolution** — always use `resolveTemplateDir()` from `packages/cli/src/utils/template-dir.ts` instead of `import.meta.dirname`-relative paths. It handles both dev (4 levels up) and published binary (`../templates`).

**SSR Nuxt plugin** — SSR apps get a single unified `plugins/vasp.{ext}` (not the old split `vasp.server` / `vasp.client`). During server-side rendering it forwards the incoming request cookies to the Elysia backend via `useRequestHeaders(['cookie'])`; on the client after hydration it uses `credentials: 'include'`. The auth middleware uses `await checkAuth()` before reading `user.value` — without it every SSR request sees `user = null` (fresh `useState`) and redirects to `/login`.

**SSR route file naming** — `routePathToNuxtFile()` emits index files (e.g. `todos/index.vue`, not `todos.vue`) to prevent Nuxt from promoting route pages to parent layouts when `autoPage` children exist in the same directory.

**Auth middleware** — uses `jose.jwtVerify()` directly for JWT verification. `@elysiajs/jwt` is only used in `plugin.hbs` for **signing**. Never use `@elysiajs/jwt`'s `jwt.verify()` inside `.resolve()` in a plugin.

**Elysia 1.x scoping** — `.resolve()`, `.onBeforeHandle()`, and `.derive()` default to **local** scope. Use `{ as: 'scoped' }` when values must propagate to parent routes.

**`@elysiajs/cookie` is deprecated** — Elysia 1.x has built-in cookie support. Do not use `@elysiajs/cookie`.

**CLI binary shebang** — `bin/vasp.ts` must have no shebang. The build injects `#!/usr/bin/env bun` via `--banner`. A shebang in source causes a syntax error in the compiled binary on line 3.

**Password hashing** — auth templates use `Bun.password.hash()` with Argon2id and `Bun.password.verify()`. Never use SHA-256 or other weak hashing for passwords.

**HTTP client** — the runtime uses `ofetch` via `@vasp-framework/runtime`. Never reference axios.

**Rate limiting** — every generated server includes `server/middleware/rateLimit.{ext}`, an IP-based sliding-window limiter. Configurable via `RATE_LIMIT_MAX` (default 100) and `RATE_LIMIT_WINDOW_MS` (default 60000) env vars.

## DSL Block Types (20 total)

Full reference: `e2e/fixtures/full-featured.vasp`

| Block | Required | Key constraints |
|-------|----------|----------------|
| `app` | Yes (exactly 1) | `ssr: false\|true\|"ssg"`, `typescript: false\|true`; optional `env:` sub-block, `multiTenant:` sub-block, and `ui:` sub-block — see below |
| `auth` | No | `userEntity`, `methods: [usernameAndPassword, google, github]`, optional `roles`, `permissions` |
| `entity` | No | Field modifiers: `@id`, `@unique`, `@default(now)`, `@nullable`, `@updatedAt`, `@manyToMany`, `@storage(Name)`, `@validate(…)`, `@onDelete(cascade\|restrict\|setNull)`; table-level: `@@index([fields])`, `@@unique([fields])`; **v2**: each field can have an inline `{ label, placeholder, description, default, validate { required, minLength, maxLength, min, max, pattern, custom } }` config block |
| `route` | No | `path`, `to: <PageName>` — page must be declared |
| `page` | No | `component: import X from "@src/…"` |
| `query` / `action` | No | `fn: import …`, `entities: […]`, optional `auth: true`, `roles: […]`, `cache: { store, ttl?, key?, invalidateOn? }` |
| `crud` | No | `entity`, `operations: [list, create, update, delete]`; **v2 nested**: `list { paginate, sortable, filterable, search, columns { fieldName { label, width, sortable, filterable, hidden } } }`, `form { layout: 1-column\|2-column\|tabs\|steps, sections { name { label, fields } }, steps { name { label, fields } } }`, `permissions` map |
| `realtime` | No | Requires matching `crud` block with same entity |
| `job` | No | `executor: PgBoss\|BullMQ\|RedisStreams\|RabbitMQ\|Kafka`, optional `schedule` (cron) |
| `api` | No | `method: GET\|POST\|PUT\|PATCH\|DELETE`, `path`, `fn: import …`, optional `auth: true`, `roles: […]` |
| `middleware` | No | `fn: import …`, `scope: global\|route` |
| `storage` | No | `provider: local\|s3\|r2\|gcs`, optional `bucket`, `maxSize`, `allowedTypes`, `publicPath` |
| `email` | No | `provider: resend\|sendgrid\|smtp`, `from`, `templates: [{ name, fn }]` |
| `cache` | No | `provider: memory\|redis\|valkey`, optional `ttl` (seconds, default 60), optional `redis: { url: ENV_VAR_NAME }` |
| `seed` | No | `fn: import { seedFn } from "@src/…"` — runs via `vasp db seed` |
| `admin` | No | `entities: [EntityName, …]` |
| `autoPage` | No | `entity`, `pageType: list\|form\|detail`; optional `title`, `fields`, `rowActions`, `topActions`, `layout`, `auth`, `roles` — generates PrimeVue 4 powered pages |
| `webhook` | No | `mode: inbound\|outbound`; inbound: `path`, `fn: import …`, optional `verifyWith: stripe-signature\|github-signature\|hmac`, `secret`; outbound: `entity`, `events: [created\|updated\|deleted]`, `targets`, optional `retry`, `secret` |
| `observability` | No | `tracing: bool`, `metrics: bool`, `logs: console\|structured`, `exporter: console\|otlp\|prometheus`, `errorTracking: none\|sentry\|datadog` |

**`app.env` sub-block** — declares typed env vars with startup validation. Each entry: `VAR_NAME: required|optional Type`. Supported types: `String`, `Int`, `Boolean`, `Enum(val1, val2, …)`. Optional modifiers: `@default(value)`, `@minLength(n)`, `@maxLength(n)`, `@startsWith("prefix")`, `@endsWith("suffix")`, `@min(n)`, `@max(n)`. The AST type is `Record<string, EnvVarDefinition>` in `packages/core/src/types/ast.ts`. `BackendGenerator` renders these into startup validation code in `templates/shared/server/index.hbs`.

**`app.multiTenant` sub-block** — opt-in multi-tenancy: `strategy: row-level|schema-level|database-level`, `tenantEntity: <EntityName>`, `tenantField: <fieldName>`. Exposed to templates via `multiTenant`, `hasMultiTenant`, `isRowLevelTenant` in `baseData()`.

**`app.ui` sub-block** — PrimeVue 4 theming: `theme: Aura|Lara|Nora|Material`, `primaryColor: <palette>` (17 named colors: blue, indigo, violet, purple, fuchsia, pink, rose, red, orange, amber, yellow, lime, green, emerald, teal, cyan, sky), `darkModeSelector: "<css-selector>"` (default: `".app-dark"`), `ripple: bool` (default: true). Exposed to templates via `ui` object in `baseData()`. Omit entirely to get Aura + system defaults.

Semantic errors E100–E126 are in `packages/parser/src/validator/SemanticValidator.ts`.

Supported field types (`SUPPORTED_FIELD_TYPES` in `packages/core/src/constants.ts`): `String`, `Int`, `Boolean`, `DateTime`, `Float`, `Text`, `Json`, `Enum`, `File`. `File` fields require `@storage(StorageName)`.

## Adding a New DSL Block Type

Every step is required — missing any causes TypeScript errors or silent runtime failures:

1. `packages/core/src/types/ast.ts` — add `XyzNode` interface, add to `VaspAST`, add to `VaspNode` union
2. `packages/core/src/constants.ts` — add any enumerated values
3. **Rebuild core**: `cd packages/core && bun run build`
4. `packages/parser/src/lexer/TokenType.ts` — add `KW_XYZ` token
5. `packages/parser/src/lexer/Lexer.ts` — add `"xyz"` → `TokenType.KW_XYZ` to keyword map
6. `packages/parser/src/parser/Parser.ts` — add `case KW_XYZ:` and implement `parseXyz()`
7. `packages/parser/src/validator/SemanticValidator.ts` — add `checkXyz()` and call from `validate()`
8. `packages/generator/src/generators/XyzGenerator.ts` — create new generator extending `BaseGenerator`
9. `packages/generator/src/generators/BaseGenerator.ts` → `baseData()` — expose `xyzs` and `hasXyz`
10. `packages/generator/src/generate.ts` — instantiate and call `new XyzGenerator(...).run()`
11. `templates/` — add Handlebars templates
12. `scripts/check-exhaustiveness.ts` — add `"Xyz"` to `VASP_NODE_TYPES`
13. Rebuild and verify: `cd packages/core && bun run build && bun run test && bun run typecheck && bun run check:exhaustiveness`

## Adding a New PrimitiveFieldType

1. `packages/core/src/types/ast.ts` — add to `PrimitiveFieldType`
2. `packages/core/src/constants.ts` — add to `SUPPORTED_FIELD_TYPES`
3. `cd packages/core && bun run build`
4. `packages/parser/src/parser/Parser.ts` — handle in `parseFieldType()`
5. `packages/generator/src/generators/DrizzleSchemaGenerator.ts` — add column mapping
6. Update any Handlebars templates that branch on field type (e.g. `FormModal.vue.hbs`)
7. `scripts/check-exhaustiveness.ts` — add to `PRIMITIVE_FIELD_TYPES`
8. `bun run check:exhaustiveness`

## Testing Notes

- Parser tests are snapshot-based (AST shape)
- Generator tests write to a temp dir and assert file contents — no mocks for the file system
- After editing any `.hbs` template or generator, run `bun run test` to catch regressions
- E2E tests in `e2e/tests/` spawn the CLI as a subprocess; no database needed
- The exhaustiveness checker flags any switch with a `default: throw` covering 3+ `VaspNode`/`PrimitiveFieldType` values but missing one. Use `// @exhaustiveness-partial: field-type` or `// @exhaustiveness-partial: vaspnode` to mark intentional partial coverage
- `generate()` writes to a `.vasp-staging-<timestamp>` directory first, then commits atomically. On any generator error the staging dir is deleted and the real output dir is untouched — `generate()` returns `{ success: false, errors: [...] }`. When debugging "all tests fail with ENOENT" check `result.errors` (tests pass `logLevel: "silent"` so errors are not printed). A failure in an early generator (e.g. `BackendGenerator`, which runs 3rd) silently prevents all later generators from running.

## Quick Reference by Task

| Task | Files to read first | Files to edit |
|------|--------------------|--------------:|
| Add new DSL block type | `core/src/types/ast.ts`, `parser/src/parser/Parser.ts` | See checklist above |
| Fix parser bug | `parser/src/lexer/TokenType.ts`, `parser/src/parser/Parser.ts` | Same files |
| Fix semantic validation error | `parser/src/validator/SemanticValidator.ts` | Same file |
| Fix generated server output | `generator/src/generators/<Name>Generator.ts` | Generator + matching `.hbs` in `templates/shared/server/` |
| Fix generated frontend output | `generator/src/generators/FrontendGenerator.ts` | `templates/spa/` or `templates/ssr/` |
| Fix auth behavior | `templates/shared/auth/server/middleware.hbs`, `plugin.hbs` | Same templates + `AuthGenerator.ts` |
| Fix Drizzle schema output | `generator/src/generators/DrizzleSchemaGenerator.ts` | `templates/shared/drizzle/schema.hbs` |
| Fix cache generation | `generator/src/generators/CacheGenerator.ts` | Generator + `templates/shared/cache/**/*.hbs` |
| Fix storage generation | `generator/src/generators/StorageGenerator.ts` | Generator + `templates/shared/storage/**/*.hbs` |
| Fix email generation | `generator/src/generators/EmailGenerator.ts` | Generator + `templates/shared/email/**/*.hbs` |
| Fix admin panel | `generator/src/generators/AdminGenerator.ts` | `templates/admin/**/*.hbs` |
| Fix autoPage generation | `generator/src/generators/AutoPageGenerator.ts` | `templates/autopages/**/*.hbs` |
| Fix webhook generation | `generator/src/generators/WebhookGenerator.ts` | `templates/shared/webhooks/**/*.hbs` |
| Fix observability generation | `generator/src/generators/ObservabilityGenerator.ts` | `templates/shared/observability/**/*.hbs` |
| Fix CLI command | `cli/src/commands/<command>.ts` | Same file |
| Fix runtime composable | `runtime/src/client/composables/use<Name>.ts` | Same file |
| Fix template helper | `generator/src/template/TemplateEngine.ts` | Same file |
| Fix language server grammar | `language-server/src/grammar/VaspDocScanner.ts` | Same file |
| Fix language server completions | `language-server/src/features/completions.ts` | Same file |
| Fix language server hover | `language-server/src/features/hover.ts` + `utils/vasp-docs.ts` | Same files |
| Fix VS Code extension | `vscode-extension/src/extension.ts`, `client.ts` | Same files |
| Fix syntax highlighting | `vscode-extension/syntaxes/vasp.tmLanguage.json` | Same file |
| Add/fix snippet | `vscode-extension/snippets/vasp.json` | Same file |

## VS Code Extension — Build & Run

See [`packages/vscode-extension/README.md`](packages/vscode-extension/README.md) for the full guide. Quick reference:

```bash
# 1. Build language server + extension
cd packages/language-server  && bun run build
cd packages/vscode-extension && bun run build

# 2. Run in dev mode (F5 in VS Code, requires .vscode/launch.json)
# Set VASP_LS_PATH env var to point to the built server:
export VASP_LS_PATH=$(pwd)/packages/language-server/dist/server.js

# 3. Package as installable .vsix
mkdir -p packages/vscode-extension/language-server
cp -r packages/language-server/dist packages/vscode-extension/language-server/dist
cd packages/vscode-extension && npx @vscode/vsce package

# 4. Install
code --install-extension packages/vscode-extension/vasp-vscode-0.1.0.vsix
```

The extension activates on `onLanguage:vasp` (any `.vasp` file). It spawns the language server as a child Node/Bun process via stdio transport. `VASP_LS_PATH` env var overrides the default server path of `language-server/dist/server.js` relative to the extension root — useful in monorepo dev mode when the dist is not co-located.
