# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Vasp is a declarative full-stack framework for Vue developers. A single `main.vasp` config file generates a complete production-ready app: Elysia backend, Vue 3 SPA (Vite) or Nuxt 4 SSR/SSG frontend, Drizzle ORM schema, auth, realtime, and background jobs.

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
```

A stop hook (`.claude/hooks/stop-check.sh`) runs automatically on session end: TSC, Handlebars validation, JSON validation, Prettier, and Knip. It outputs `decision: block` if errors are found — fix them before finishing.

## Architecture

### Three-Phase Pipeline

1. **Parse** — `.vasp` source → `Lexer` → `Parser` → AST → `SemanticValidator`
2. **Generate** — AST walk → 15 generators in order → Handlebars template rendering → staging dir
3. **Commit** — Staged files committed to real output dir (preserves `.env`, removes stale files)

### Monorepo Packages

| Package | npm name | Purpose |
|---------|----------|---------|
| `packages/core` | `@vasp-framework/core` | `VaspAST` types, errors, constants — source of truth |
| `packages/parser` | `@vasp-framework/parser` | `Lexer`, `Parser`, `SemanticValidator` |
| `packages/generator` | `@vasp-framework/generator` | 15 generators + `TemplateEngine` (Handlebars) |
| `packages/runtime` | `@vasp-framework/runtime` | `$vasp`/`useQuery`/`useAction`/`useAuth` composables shipped into generated apps |
| `packages/cli` | `vasp-cli` | CLI commands (`vasp new`, `vasp generate`, `vasp start`, etc.) |

### Generator Execution Order

Defined in `packages/generator/src/generate.ts`:

1. `ScaffoldGenerator` — package.json, tsconfig, .env, README
2. `DrizzleSchemaGenerator` — DB schema (entities, enums, relations)
3. `BackendGenerator` — Elysia server entry, DB client, middleware, Swagger
4. `AuthGenerator` — auth routes + Login/Register Vue components
5. `MiddlewareGenerator` — custom middleware blocks
6. `QueryActionGenerator` — query/action server handlers
7. `ApiGenerator` — custom API endpoints
8. `CrudGenerator` — REST CRUD endpoints
9. `RealtimeGenerator` — WebSocket channels
10. `JobGenerator` — PgBoss background jobs
11. `SeedGenerator` — DB seed script
12. `StorageGenerator` — file upload endpoints
13. `EmailGenerator` — email provider setup
14. `AdminGenerator` — standalone Vue 3 + Ant Design admin panel
15. `FrontendGenerator` — Vue SPA (Vite) or Nuxt 4 SSR/SSG

All generators extend `BaseGenerator`. `baseData()` exposes `appName`, `routes`, `queries`, `actions`, `auth`, `crud`, `realtime`, `jobs` to every template. `GeneratorContext` carries `{ ast, outputDir, templateDir, isTypeScript, isSsr, isSpa, mode, ext }`.

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

**Auth middleware** — uses `jose.jwtVerify()` directly for JWT verification. `@elysiajs/jwt` is only used in `plugin.hbs` for **signing**. Never use `@elysiajs/jwt`'s `jwt.verify()` inside `.resolve()` in a plugin.

**Elysia 1.x scoping** — `.resolve()`, `.onBeforeHandle()`, and `.derive()` default to **local** scope. Use `{ as: 'scoped' }` when values must propagate to parent routes.

**`@elysiajs/cookie` is deprecated** — Elysia 1.x has built-in cookie support. Do not use `@elysiajs/cookie`.

**CLI binary shebang** — `bin/vasp.ts` must have no shebang. The build injects `#!/usr/bin/env bun` via `--banner`. A shebang in source causes a syntax error in the compiled binary on line 3.

**Password hashing** — auth templates use `Bun.password.hash()` with Argon2id and `Bun.password.verify()`. Never use SHA-256 or other weak hashing for passwords.

**HTTP client** — the runtime uses `ofetch` via `@vasp-framework/runtime`. Never reference axios.

**Rate limiting** — every generated server includes `server/middleware/rateLimit.{ext}`, an IP-based sliding-window limiter. Configurable via `RATE_LIMIT_MAX` (default 100) and `RATE_LIMIT_WINDOW_MS` (default 60000) env vars.

## DSL Block Types (13 total)

Full reference: `e2e/fixtures/full-featured.vasp`

| Block | Required | Key constraints |
|-------|----------|----------------|
| `app` | Yes (exactly 1) | `ssr: false\|true\|"ssg"`, `typescript: false\|true`; optional `env:` sub-block — see below |
| `auth` | No | `userEntity`, `methods: [usernameAndPassword, google, github]` |
| `entity` | No | Field modifiers: `@id`, `@unique`, `@default(now)`, `@nullable`, `@updatedAt`, `@manyToMany`, `@storage(Name)` |
| `route` | No | `path`, `to: <PageName>` — page must be declared |
| `page` | No | `component: import X from "@src/…"` |
| `query` / `action` | No | `fn: import …`, `entities: […]`, optional `auth: true` |
| `crud` | No | `entity`, `operations: [list, create, update, delete]` |
| `realtime` | No | Requires matching `crud` block with same entity |
| `job` | No | `executor: PgBoss`, optional `schedule` (cron) |
| `storage` | No | `provider: local\|s3\|r2\|gcs` |
| `email` | No | `provider: resend\|sendgrid\|smtp` |
| `admin` | No | `entities: [EntityName, …]` |

**`app.env` sub-block** — declares typed env vars with startup validation. Each entry: `VAR_NAME: required|optional Type`. Supported types: `String`, `Int`, `Boolean`, `Enum(val1, val2, …)`. Optional modifiers: `@default(value)`, `@minLength(n)`, `@maxLength(n)`, `@startsWith("prefix")`, `@endsWith("suffix")`, `@min(n)`, `@max(n)`. The AST type is `Record<string, EnvVarDefinition>` in `packages/core/src/types/ast.ts`. `BackendGenerator` renders these into startup validation code in `templates/shared/server/index.hbs`.

Semantic errors E100–E115 are in `packages/parser/src/validator/SemanticValidator.ts`.

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
| Fix admin panel | `generator/src/generators/AdminGenerator.ts` | `templates/admin/**/*.hbs` |
| Fix CLI command | `cli/src/commands/<command>.ts` | Same file |
| Fix runtime composable | `runtime/src/client/composables/use<Name>.ts` | Same file |
| Fix template helper | `generator/src/template/TemplateEngine.ts` | Same file |
