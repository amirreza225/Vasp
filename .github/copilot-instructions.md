# Vasp — Workspace Instructions

Vasp is a declarative full-stack framework for Vue developers. A single `main.vasp` config file generates a complete app: Elysia backend, Vue 3 SPA or Nuxt 4 SSR/SSG frontend, Drizzle ORM schema, auth, realtime, and background jobs.

---

## Monorepo Layout

```
packages/
  core/       → @vasp-framework/core     — Types (VaspAST, errors, constants)
  parser/     → @vasp-framework/parser   — Lexer + Parser + SemanticValidator
  generator/  → @vasp-framework/generator — 10 generators + Handlebars TemplateEngine
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
vasp enable-ssr        # Upgrade SPA app to SSR
vasp migrate-to-ts     # Convert JS app to TypeScript
```

**Building the CLI** (`packages/cli`):
```bash
cd packages/cli && bun run build
```
Output is `dist/vasp` — a single compiled binary with `#!/usr/bin/env bun` shebang injected by `--banner`. The source file `bin/vasp.ts` must NOT contain its own shebang.

---

## .vasp DSL

The 9 block types — full reference in [e2e/fixtures/full-featured.vasp](../e2e/fixtures/full-featured.vasp):

| Block | Required | Notes |
|-------|----------|-------|
| `app` | Yes, exactly 1 | `ssr: false\|true\|"ssg"`, `typescript: false\|true` |
| `auth` | No | `userEntity`, `methods: [usernameAndPassword, google, github]` |
| `route` | No | `path`, `to: <PageName>` — page must be defined |
| `page` | No | `component: import X from "@src/…"` |
| `query` | No | `fn: import …`, `entities: […]` |
| `action` | No | `fn: import …`, `entities: […]` |
| `crud` | No | `entity`, `operations: [list, create, update, delete]` |
| `realtime` | No | Requires matching `crud` block with same entity |
| `job` | No | `executor: import …`, `schedule` |

Semantic errors E100–E107 cover: missing app, undefined route targets, missing CRUD ops, realtime without entity, unknown auth methods, missing executors. See [SemanticValidator.ts](../packages/parser/src/validator/SemanticValidator.ts).

---

## Generator Pattern

All generators extend `BaseGenerator` — [`packages/generator/src/generators/BaseGenerator.ts`](../packages/generator/src/generators/BaseGenerator.ts).

**Execution order** in [`generate.ts`](../packages/generator/src/generate.ts):
1. `ScaffoldGenerator` — package.json, tsconfig, bunfig, .gitignore
2. `DrizzleSchemaGenerator` — DB schema
3. `BackendGenerator` — Elysia server entry + DB client
4. `AuthGenerator` — auth routes + Login/Register Vue components
5. `QueryActionGenerator` — server query/action handlers
6. `CrudGenerator` — CRUD REST endpoints
7. `RealtimeGenerator` — WebSocket channels
8. `JobGenerator` — PgBoss background jobs
9. `FrontendGenerator` — full Vue SPA (Vite) or Nuxt 4 SSR/SSG scaffold

**GeneratorContext** — [`GeneratorContext.ts`](../packages/generator/src/GeneratorContext.ts):
```ts
{ ast, outputDir, templateDir, isTypeScript, isSsr, isSpa, mode, ext }
```

`baseData()` in BaseGenerator spreads `appName`, `routes`, `queries`, `actions`, `auth`, `crud`, `realtime`, `jobs` into every template.

---

## Template System

Source: `templates/` (monorepo root). Structure:
```
templates/
  shared/{js,ts}/     # Generated for all modes
  spa/{js,ts}/        # Vite SPA only
  ssr/{js,ts}/        # Nuxt 4 SSR/SSG only
  starters/           # Pre-built example apps (minimal, todo, todo-auth-ssr)
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

---

## Testing

- Framework: **Vitest** (configured in [`vitest.config.ts`](../vitest.config.ts))
- Test files: `packages/*/src/**/*.test.ts`
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

---

## Key Files

| File | Purpose |
|------|---------|
| [`packages/core/src/types/ast.ts`](../packages/core/src/types/ast.ts) | VaspAST node type definitions — source of truth |
| [`packages/parser/src/lexer/TokenType.ts`](../packages/parser/src/lexer/TokenType.ts) | All DSL token definitions |
| [`packages/generator/src/generators/BaseGenerator.ts`](../packages/generator/src/generators/BaseGenerator.ts) | Generator base class and `baseData()` |
| [`packages/generator/src/template/TemplateEngine.ts`](../packages/generator/src/template/TemplateEngine.ts) | Handlebars helpers |
| [`packages/cli/src/utils/template-dir.ts`](../packages/cli/src/utils/template-dir.ts) | Prod/dev template path resolution |
| [`e2e/fixtures/full-featured.vasp`](../e2e/fixtures/full-featured.vasp) | Reference .vasp with all block types |
| [`Vasp-prd-1-0.md`](../Vasp-prd-1-0.md) | Product requirements & architecture spec |
