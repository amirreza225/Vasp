# Vasp — Workspace Instructions

Vasp is a declarative full-stack framework for Vue developers. A single `main.vasp` config file generates a complete app: Elysia backend, Vue 3 SPA or Nuxt 4 SSR/SSG frontend, Drizzle ORM schema, auth, realtime, and background jobs.

---

## Monorepo Layout

```
packages/
  core/       → @vasp-framework/core     — Types (VaspAST, errors, constants)
  parser/     → @vasp-framework/parser   — Lexer + Parser + SemanticValidator
  generator/  → @vasp-framework/generator — 12 generators + Handlebars TemplateEngine
  runtime/    → @vasp-framework/runtime  — $vasp composable shipped into generated apps
  cli/        → vasp-cli                 — CLI commands, scaffolding, starter templates
templates/                               — Handlebars (.hbs) source for generated files
e2e/fixtures/                            — Reference .vasp files (full-featured, minimal, todo)
```

Package manager: **Bun** with workspaces. All packages are ESM only.

---

## Commands

```bash
# Workspace
bun run build          # Build all packages in dependency order
bun run test           # Vitest (all packages)
bun run test:watch     # Watch mode
bun run test:coverage  # Coverage via v8
bun run typecheck      # tsc --noEmit across all packages
bun run lint           # ESLint on packages/*/src/**/*.ts

# CLI (after global install: bun add -g vasp-cli)
vasp new <name>        # Scaffold a new app from main.vasp
vasp new <name> --starter <name>  # Use a starter template (minimal, todo, todo-auth-ssr, recipe)
vasp generate [--force] [--dry-run]  # Safe regeneration from main.vasp
vasp start             # Dev server (backend + frontend with hot reload + schema auto-migration)
vasp build             # Production build
vasp enable-ssr        # Upgrade SPA app to SSR
vasp migrate-to-ts     # Convert JS app to TypeScript
vasp db push           # Push Drizzle schema to database
vasp db generate       # Generate Drizzle migrations
vasp db migrate        # Run pending migrations
vasp db studio         # Open Drizzle Studio GUI
vasp db seed           # Seed the database
vasp deploy --target=<docker|fly|railway>  # Generate deployment config files
vasp eject [--confirm] # Remove Vasp framework dependency, inline runtime
```

**Building the CLI** (`packages/cli`):
```bash
cd packages/cli && bun run build
```
Output is `dist/vasp` — a single compiled binary with `#!/usr/bin/env bun` shebang injected by `--banner`. The source file `bin/vasp.ts` must NOT contain its own shebang.

---

## .vasp DSL

The 13 block types — full reference in [e2e/fixtures/full-featured.vasp](../e2e/fixtures/full-featured.vasp):

| Block | Required | Notes |
|-------|----------|-------|
| `app` | Yes, exactly 1 | `ssr: false\|true\|"ssg"`, `typescript: false\|true` |
| `auth` | No | `userEntity`, `methods: [usernameAndPassword, google, github]` |
| `entity` | No | Typed fields with modifiers (`@id`, `@unique`, `@default(now)`, `@nullable`, `@manyToMany`, `@storage(Name)`) |
| `route` | No | `path`, `to: <PageName>` — page must be defined |
| `page` | No | `component: import X from "@src/…"` |
| `query` | No | `fn: import …`, `entities: […]`, optional `auth: true` |
| `action` | No | `fn: import …`, `entities: […]`, optional `auth: true`, optional `onSuccess: { sendEmail: <templateName> }` |
| `crud` | No | `entity`, `operations: [list, create, update, delete]` |
| `realtime` | No | Requires matching `crud` block with same entity |
| `job` | No | `executor: PgBoss`, `perform.fn: import …`, optional `schedule` |
| `storage` | No | `provider: local\|s3\|r2\|gcs`, `bucket`, `maxSize`, `allowedTypes`, `publicPath` |
| `email` | No | `provider: resend\|sendgrid\|smtp`, `from`, `templates: { name: import … }` |
| `admin` | No | `entities: [EntityName, …]` — generates Vue admin panel |

Semantic errors E100–E115 cover: missing app, undefined route targets, empty/invalid CRUD ops, realtime without CRUD entity, unknown auth methods, unknown entity refs in query/action/crud, invalid job executors, duplicate entity names (E112), duplicate route paths (E113), invalid entity field types (E114), unknown email providers (E115). See [SemanticValidator.ts](../packages/parser/src/validator/SemanticValidator.ts).

---

## Generator Pattern

All generators extend `BaseGenerator` — [`packages/generator/src/generators/BaseGenerator.ts`](../packages/generator/src/generators/BaseGenerator.ts).

**Execution order** in [`generate.ts`](../packages/generator/src/generate.ts):
1. `ScaffoldGenerator` — package.json, tsconfig, bunfig, .gitignore, .env, .env.example, README.md, test scaffold
2. `DrizzleSchemaGenerator` — DB schema (entities, enums, relations, FK constraints)
3. `BackendGenerator` — Elysia server entry + DB client + middleware + Swagger (`/api/docs`)
4. `AuthGenerator` — auth routes + Login/Register Vue components
5. `MiddlewareGenerator` — custom middleware blocks
6. `QueryActionGenerator` — server query/action handlers
7. `ApiGenerator` — custom API endpoints
8. `CrudGenerator` — CRUD REST endpoints
9. `RealtimeGenerator` — WebSocket channels
10. `JobGenerator` — PgBoss background jobs
11. `SeedGenerator` — database seed script
12. `StorageGenerator` — file upload endpoints + storage config
13. `EmailGenerator` — email provider setup + transporter
14. `AdminGenerator` — Vue admin panel (separate Vite app in `admin/`)
15. `FrontendGenerator` — full Vue SPA (Vite) or Nuxt 4 SSR/SSG scaffold

**GeneratorContext** — [`GeneratorContext.ts`](../packages/generator/src/GeneratorContext.ts):
```ts
{ ast, outputDir, templateDir, isTypeScript, isSsr, isSpa, mode, ext }
```

`baseData()` in BaseGenerator spreads `appName`, `routes`, `queries`, `actions`, `auth`, `crud`, `realtime`, `jobs` into every template.

`resolveServerImport(importStr)` in BaseGenerator rewrites `@src/foo.js` → `@src/foo.ts` when `isTypeScript` is true — used by QueryActionGenerator, CrudGenerator, and JobGenerator.

---

## Template System

Source: `templates/` (monorepo root). Structure:
```
templates/
  shared/              # Generated for all modes (server, auth, drizzle, jobs, middleware)
  spa/{js,ts}/         # Vite SPA only
  ssr/{js,ts}/         # Nuxt 4 SSR/SSG only
  starters/            # Pre-built example apps (minimal, todo, todo-auth-ssr, recipe)
```

Engine — [`TemplateEngine.ts`](../packages/generator/src/template/TemplateEngine.ts) — Handlebars with custom helpers: `camelCase`, `pascalCase`, `kebabCase`, `join`, `importPath`, `importName`, `eq`, `includes`.

**`importPath` helper:** rewrites `@src/foo.js` → `@src/foo.ts` when `isTypeScript` is true — never hard-code `.ts` in templates.

---

## Key Conventions

**1. ESM imports use `.js` extension** (even when the source is `.ts`):
```ts
import { Parser } from './Parser.js'   // ✅
import { Parser } from './Parser'      // ❌ breaks ESM resolution
```

**2. Workspace deps** use `workspace:*` in `package.json` — rewritten to concrete semver on publish. Never reference them with hardcoded versions in inner packages.

**3. Template path resolution** — In the published CLI binary, templates live at `../templates` relative to `dist/vasp`. In dev (monorepo), they're 4 levels up. The [`resolveTemplateDir()`](../packages/cli/src/utils/template-dir.ts) utility handles both cases — always use it instead of `import.meta.dirname`-relative paths.

**4. File extension pattern** — Generator output paths use `.{ext}` (from `ctx.ext`) to emit `.js` or `.ts` correctly based on compiler flags.

**5. TypeScript config** — All packages extend [`tsconfig.base.json`](../tsconfig.base.json) (target: ESNext, moduleResolution: bundler, composite: true, strict: true). Generate declarations alongside output.

**6. Rate limiting** — Every generated server includes `server/middleware/rateLimit.{ext}`, an IP-based sliding-window limiter using Elysia's `onBeforeHandle` hook. Configurable via `RATE_LIMIT_MAX` (default 100) and `RATE_LIMIT_WINDOW_MS` (default 60000) env vars. The BackendGenerator always emits it; the server template always imports and `.use()`-s it.

**7. HTTP client** — The runtime uses `ofetch` (isomorphic fetch) via `@vasp-framework/runtime` (`client/ofetch.ts`). Credentials are auto-included. Never reference axios.

**8. Password hashing** — Auth templates use `Bun.password.hash()` with Argon2id (cost 2) and `Bun.password.verify()`. Never use SHA-256 or other weak hashing for passwords.

**9. Pre-flight checks** — `vasp start` auto-copies `.env.example` → `.env` if missing, and runs `bun install` if `node_modules` is absent.

**10. `SUPPORTED_FIELD_TYPES`** — Defined in `packages/core/src/constants.ts`: `['String', 'Int', 'Boolean', 'DateTime', 'Float', 'Text', 'Json', 'Enum', 'File']`. SemanticValidator E114 enforces this. `File` fields require a `@storage(StorageName)` modifier referencing a declared `storage` block.

**11. Auth middleware uses `jose` for JWT verification** — The `requireAuth` middleware (`templates/shared/auth/server/middleware.hbs`) uses `jose.jwtVerify()` directly to verify JWT tokens from cookies. The `@elysiajs/jwt` plugin is only used in `authPlugin` (`plugin.hbs`) for **signing** tokens during login/register. Never use `@elysiajs/jwt`'s `jwt.verify()` decorator inside `.resolve()` in a plugin — it doesn't propagate correctly.

**12. Elysia 1.x scoping** — `.resolve()`, `.onBeforeHandle()`, and `.derive()` default to **local** scope in Elysia 1.x. When used inside a plugin that is `.use()`-d by a parent Elysia instance, their values/guards do **not** propagate unless `{ as: 'scoped' }` (or `{ as: 'global' }`) is passed. The auth middleware uses `{ as: 'scoped' }` on both `.resolve()` and `.onBeforeHandle()` so `user` is available in parent routes.

---

## Adding a New DSL Block Type

When adding a new block (e.g. `webhook`, `cache`), every step below is required.
Missing any one of them causes TypeScript errors across packages or silent runtime failures.

**1. `packages/core/src/types/ast.ts`**
- Add `XyzNode` interface extending `BaseNode` with `type: "Xyz"`
- Add `xyzs?: XyzNode[]` (or `xyz?: XyzNode`) to `VaspAST`
- Add `XyzNode` to the `VaspNode` union

**2. `packages/core/src/constants.ts`** (if the block has enumerated values)
- Add `SUPPORTED_XYZ_PROVIDERS` or equivalent constant array

**3. Rebuild core** — `cd packages/core && bun run build`
All downstream packages read from `dist/` via TypeScript project references.
Skipping this causes "Property does not exist on type VaspAST" errors everywhere.

**4. `packages/parser/src/lexer/TokenType.ts`**
- Add `KW_XYZ = "KW_XYZ"` token

**5. `packages/parser/src/lexer/Lexer.ts`**
- Add `"xyz"` → `TokenType.KW_XYZ` to the keyword map

**6. `packages/parser/src/parser/Parser.ts`**
- Add `case TokenType.KW_XYZ:` to the main `switch` in `parse()`
- Implement `parseXyz(): XyzNode` method
- Push results into `ast.xyzs`

**7. `packages/parser/src/validator/SemanticValidator.ts`**
- Add a `checkXyz(ast)` private method
- Call it from `validate()`

**8. `packages/generator/src/generators/XyzGenerator.ts`**
- Create new generator extending `BaseGenerator`
- Implement `run(): void`

**9. `packages/generator/src/generators/BaseGenerator.ts`** → `baseData()`
- Expose `xyzs: ast.xyzs ?? []` and `hasXyz: (ast.xyzs?.length ?? 0) > 0`

**10. `packages/generator/src/generate.ts`**
- Instantiate and call `new XyzGenerator(ctx, engine, filesWritten, manifest).run()`

**11. `templates/`**
- Add Handlebars templates for any generated files

**12. `scripts/check-exhaustiveness.ts`**
- Add `"Xyz"` to `VASP_NODE_TYPES` set

**13. `packages/core` rebuild again + test**
- `cd packages/core && bun run build`
- `bun run test`
- `bun run typecheck`
- `bun run check:exhaustiveness`

---

## Adding a New PrimitiveFieldType

When adding a new field type (e.g. `BigInt`):

1. `packages/core/src/types/ast.ts` — add `"BigInt"` to `PrimitiveFieldType`
2. `packages/core/src/constants.ts` — add `"BigInt"` to `SUPPORTED_FIELD_TYPES`
3. Rebuild core: `cd packages/core && bun run build`
4. `packages/parser/src/parser/Parser.ts` — handle `BigInt` in `parseFieldType()`
5. `packages/generator/src/generators/DrizzleSchemaGenerator.ts` — add column mapping
6. Update any Handlebars templates that branch on field type (e.g. `FormModal.vue.hbs`)
7. `scripts/check-exhaustiveness.ts` — add `"BigInt"` to `PRIMITIVE_FIELD_TYPES`
8. Run `bun run check:exhaustiveness` — it will find any files that handle 3+ field types but miss the new one

---

## CI and Local Checks

```bash
bun run build                  # Build all packages in dependency order
bun run typecheck              # tsc --noEmit across all packages
bun run lint                   # ESLint
bun run check:exhaustiveness   # Verify PrimitiveFieldType and VaspNode switch coverage
bun run test                   # Vitest unit tests
bun run test:e2e               # E2E: spawns CLI as subprocess, no DB needed
bun run test:browser           # Playwright browser tests (requires bun run build first)
```

**Stop hook** — `.claude/hooks/stop-check.sh` runs automatically on session end (Claude Code only):
runs TSC, Handlebars validation, JSON validation, Prettier, and Knip.
Outputs `decision: block` if errors are found — fix them before finishing.

**Exhaustiveness checker** — `scripts/check-exhaustiveness.ts`:
- Flags any `.ts` file that compares `.type` against 3+ `PrimitiveFieldType` strings but misses one
- Flags any switch with a `default: throw` covering 3+ `VaspNode` types but missing one
- Files with intentional partial coverage use `// @exhaustiveness-partial: field-type` or `// @exhaustiveness-partial: vaspnode`

---

## Testing

- Framework: **Vitest** (configured in [`vitest.config.ts`](../vitest.config.ts), E2E in [`vitest.e2e.config.ts`](../vitest.e2e.config.ts))
- Test files: `packages/*/src/**/*.test.ts`
- E2E tests: `e2e/tests/`
- Parser tests: snapshot-based (AST shape)
- Generator tests: write to a temp dir, assert file contents
- No mocks for the file system — tests use real `fs`

After editing any `.hbs` template or generator, run `bun run test` to catch regressions.

---

## Common Pitfalls

- **Shebang duplication:** The CLI build injects `#!/usr/bin/env bun` via `--banner`. `bin/vasp.ts` must have no shebang of its own or the compiled binary will fail with a syntax error on line 3.
- **`packages/cli/templates/` is a build artifact** — generated by `cp -r ../../templates ./templates` during `bun run build`. It is gitignored. Edit templates in `templates/` (root), not in the package copy.
- **`workspace:*` outside monorepo** — Published binaries bundle their deps via `bun build`; do not list `@vasp-framework/*` packages as runtime deps in `packages/cli/package.json`.
- **`@vasp-framework/runtime` exports** — Must point to `dist/index.js`, not the `.ts` source, or Vite will fail to resolve the package in generated apps.
- **Realtime requires CRUD** — A `realtime` block's entity must have a matching `crud` block; SemanticValidator enforces this.
- **`vasp db` requires generated app** — The `vasp db` subcommands shell out to `bunx drizzle-kit` inside the generated app directory. Ensure `vasp new` has been run first.
- **`.env` auto-generation** — `ScaffoldGenerator` emits `.env` and `.env.example` with `DATABASE_URL` and `JWT_SECRET` placeholders. The `vasp start` pre-flight copies `.env.example` → `.env` if missing.
- **`@elysiajs/cookie` is deprecated** — Elysia 1.x has built-in cookie support (`cookie` in handler context). Do not import or use `@elysiajs/cookie` in templates or generated code.

---

## Key Files

| File | Purpose |
|------|---------|
| [`packages/core/src/types/ast.ts`](../packages/core/src/types/ast.ts) | VaspAST node type definitions — source of truth |
| [`packages/parser/src/lexer/TokenType.ts`](../packages/parser/src/lexer/TokenType.ts) | All DSL token definitions |
| [`packages/generator/src/generators/BaseGenerator.ts`](../packages/generator/src/generators/BaseGenerator.ts) | Generator base class and `baseData()` |
| [`packages/generator/src/template/TemplateEngine.ts`](../packages/generator/src/template/TemplateEngine.ts) | Handlebars helpers |
| [`packages/cli/src/utils/template-dir.ts`](../packages/cli/src/utils/template-dir.ts) | Prod/dev template path resolution |
| [`packages/runtime/src/client/ofetch.ts`](../packages/runtime/src/client/ofetch.ts) | `$vasp` client factory (ofetch-based) |
| [`templates/shared/server/middleware/rateLimit.hbs`](../templates/shared/server/middleware/rateLimit.hbs) | Rate limiter middleware template |
| [`templates/shared/auth/server/middleware.hbs`](../templates/shared/auth/server/middleware.hbs) | Auth middleware — jose-based JWT verification |
| [`templates/shared/auth/server/plugin.hbs`](../templates/shared/auth/server/plugin.hbs) | Auth plugin — `@elysiajs/jwt` for signing tokens |
| [`e2e/fixtures/full-featured.vasp`](../e2e/fixtures/full-featured.vasp) | Reference .vasp with all block types |
| [`packages/cli/src/commands/db.ts`](../packages/cli/src/commands/db.ts) | `vasp db` subcommand (push/generate/migrate/studio) |
| [`templates/shared/.env.hbs`](../templates/shared/.env.hbs) | Environment variables template |
| [`Vasp-prd-1-0.md`](../Vasp-prd-1-0.md) | Product requirements & architecture spec |
