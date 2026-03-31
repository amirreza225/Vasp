# Vasp — Deep Codebase Analysis & Improvement Plan

> **Written:** 2026-03-31  
> **Scope:** All packages (`core`, `parser`, `generator`, `runtime`, `cli`, `language-server`, `vscode-extension`), all 139 Handlebars templates, all tests, and all tooling scripts were read before writing this document.  
> **Prior art:** `CODEBASE_ANALYSIS.md` exists and many issues there are marked ✅ (already fixed). This document starts from the current, fixed baseline and goes deeper.

---

## Executive Summary

Vasp is architecturally impressive for its feature set. The three-phase pipeline (parse → stage → commit), the Manifest-driven orphan cleanup, the typed `BaseTemplateData`, and the exhaustiveness checker are all production-grade design decisions. The framework's biggest remaining risks fall into five buckets:

1. **Schema template still hardcodes the auth user table** — the `userTableName` fix reached auth middleware and providers but the Drizzle `schema.hbs` still emits `export const users = pgTable('users', …)` unconditionally, so `auth { userEntity: Account }` generates both an `accounts` table (from the entity block) **and** a separate `users` table that the auth routes import — a compile-time error in the generated app.
2. **The language server and VS Code extension are excluded from the monorepo build** — they are neither in `bun run build` nor in `bun run typecheck`, so they silently diverge from the rest of the codebase with no CI signal.
3. **Generated code is never type-checked** — tests verify file existence and string inclusion; nothing verifies that the generated TypeScript actually compiles.
4. **The `add` command bypasses the parser round-trip** — it concatenates raw DSL strings, making it trivially easy to produce malformed `main.vasp`.
5. **Growing architectural tension between the hand-written parser and the Chevrotain grammar** — while diagnostics were unified via `parseAll()`, completions, hover, and go-to-definition in the language server still rely on the Chevrotain CST, which lags every DSL feature by weeks or months.

---

## Tier 1 — Critical (correctness / security)

### 1. Drizzle `schema.hbs` hardcodes the auth user table as `users`

**Current state:** `DrizzleSchemaGenerator` correctly removes the auth user entity from the normal entity loop and passes its extra fields as `authUserExtraFields`. However, `schema.hbs` always emits:

```handlebars
export const users = pgTable('users', { … })
export type User = InferSelectModel<typeof users>
```

The `AuthGenerator` correctly computes `userTableName = toPlural(toCamelCase(ast.auth!.userEntity))` and passes it to auth route templates, but this value is **never passed** to the schema template. If `userEntity: Account`, the schema emits both `accounts` (from the entity block) and the hardcoded `users` table — a duplicate that will fail at runtime.

**Fix:** Pass `userTableName`, `authUserEntityName`, and `passwordFieldName` to the schema template and replace the hardcoded identifiers with `{{userTableName}}`, `{{authUserEntityName}}`, etc.

---

### 2. Language server and VS Code extension excluded from `bun run build` and `bun run typecheck`

**Current state:** `package.json` build script is:

```
bun run --filter '@vasp-framework/core' build && … && bun run --filter 'vasp-cli' build
```

Neither `@vasp-framework/language-server` nor `vasp-vscode` appear. Running `bun run build` from the monorepo root leaves them un-built. Similarly, `bun run typecheck` runs `tsc --noEmit -p tsconfig.base.json` which references only the five core packages. The language server and extension can have type errors indefinitely with no CI signal.

**Fix:** Add both to the `build` script and add their `tsconfig.json` to the `references` array in `tsconfig.base.json`.

---

### 3. JWT_SECRET startup validation is not enforced when `app.env` is absent

**Current state:** `middleware.hbs` reads:

```js
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!)
```

The `!` non-null assertion only suppresses TypeScript. At runtime, `process.env.JWT_SECRET` will be `undefined` if the env var is unset and `app.env` was not declared by the user. `TextEncoder().encode(undefined)` silently encodes the string `"undefined"` — every JWT signed with `"undefined"` as the secret is verifiable by any attacker who knows this behavior.

The `app.env` block solves this correctly, but nothing _automatically_ adds `JWT_SECRET: required String` when an `auth` block is present. Users who don't know about `app.env` never get protection.

**Fix:** `AuthGenerator` should emit a startup crash guard in the generated server entry — or inject `JWT_SECRET: required String @minLength(32)` into the env validation block automatically when auth is declared.

---

### 4. `schema.hbs` emits `googleId` and `githubId` unconditionally on the users table

**Current state:** The auth users table in `schema.hbs` always includes:

```handlebars
googleId: text('google_id').unique(),
githubId: text('github_id').unique(),
```

Even when the app only uses `methods: [usernameAndPassword]`, these columns are always present. This is harmless but wrong — it adds nullable unique columns that serve no purpose and waste index space. More importantly, the Google/GitHub providers reference these columns in their `WHERE` clauses, so if the schema ever diverges from what the provider expects, there is a silent runtime failure.

**Fix:** Conditionally emit `googleId`/`githubId` based on `authMethods` (already available in the template context) and thread that information into the schema template.

---

### 5. `CRUD` route filter for unallowlisted fields is unsanitized user input

**Current state:** When `listConfig` is absent, the `_crud.hbs` list endpoint falls through to:

```js
for (const [key, value] of Object.entries(query)) {
  if (!key.startsWith('filter.')) continue
  const field = key.slice(7)
  if (!table[field]) continue
  conditions.push(eq(table[field], value))
}
```

`table[field]` is a Drizzle column accessor indexed by a user-controlled string. Drizzle does not sanitize column names — it passes them to the SQL builder. If `table[field]` happens to be a non-column property (e.g., `constructor`, `__proto__`), behavior is undefined. More concretely, a user can probe any column name they choose, effectively turning the list endpoint into a column-enumeration tool and bypassing any `@hidden` field intent.

**Fix:** Build an explicit allowlist of column names from the entity's declared fields at generation time and use it in the template instead of the open-ended property access pattern.

---

## Tier 2 — High Severity (reliability / expansion friction)

### 6. Generated TypeScript is never compiled — tests verify strings, not correctness

**Current state:** Generator tests call `existsSync(path)` and `readFileSync(path).includes("someString")`. The E2E suite verifies that `vasp new` exits with code 0 and a list of files exists. Nothing anywhere runs `tsc --noEmit` on a generated project. A generator bug that emits a valid-looking but uncompilable TypeScript file (wrong import path, misspelled type, unclosed generic) will pass all tests.

**Fix:** Add a dedicated E2E test step that runs `bunx tsc --noEmit` inside the generated project directory for both TypeScript modes (SPA-TS and SSR-TS). This single check would have caught multiple regressions in the past and will catch them in the future as generators evolve.

---

### 7. `vasp add` generates raw DSL strings without a parser round-trip

**Current state:** `cli/src/commands/add.ts` builds DSL block strings by hand:

```ts
function buildEntityBlock(name: string, fields: FieldDef[]): string {
  return `entity ${name} {\n  id: Int @id\n  …`
}
```

After appending the string to `main.vasp`, it calls `runRegenerate()`. If the concatenated string is syntactically invalid (wrong indentation, missing brace, incorrect keyword), the parse fails with a confusing error at an offset inside the newly appended block. The user sees a parser error but not which `vasp add` invocation caused it.

**Fix:** After building the string, run `parse(newSource)` on it _before_ writing to disk. If it fails, print the diagnostic, restore the original file, and exit. Alternatively, define typed builders in `packages/parser` that produce valid AST nodes and serialize them correctly.

---

### 8. The Chevrotain grammar (language server) lags every new DSL feature

**Current state:** The diagnostics feature was unified (`diagnostics.ts` now calls `parseAll()` from `@vasp-framework/parser`). However, completions, hover, and go-to-definition still rely on `VaspCstVisitor` producing a partial symbol table from the Chevrotain CST. Every new DSL feature requires:

1. Adding tokens to `VaspLexer.ts`
2. Adding grammar rules to `VaspParser.ts`
3. Adding visitor branches to `VaspCstVisitor.ts`
4. Adding completions to `completions.ts`
5. Adding hover docs to `vasp-docs.ts`

This is 5 files to change, all in the language server package, every single time. The 20-block DSL (autoPage, webhook, observability, cache, etc.) expands continuously and the language server regularly lags.

**Fix:** Retire `VaspCstVisitor` as a symbol-table producer. Instead, run `@vasp-framework/parser`'s `parse()` (fault-tolerant when a try/catch wrapper returns a partial AST), extract the symbol table directly from the `VaspAST`, and feed it to completions/hover/definition. The Chevrotain grammar is then only needed for positional fault tolerance (which line/column the cursor is at), not for semantic understanding. This eliminates three of the five file changes per new feature.

---

### 9. `schema.hbs` emits hardcoded `passwordHash` column regardless of `userEntity` field name

**Current state:** The auth users table in `schema.hbs` always emits:

```handlebars
passwordHash: text('password_hash'),
```

`AuthGenerator` correctly resolves `passwordFieldName` (supporting `password` or `passwordHash`) and passes it to auth route templates — but not to the schema template. If the user entity defines the field as `password: String`, the schema emits `passwordHash` while the middleware and provider templates correctly use `password`. The generated server will fail to compile.

**Fix:** Pass `passwordFieldName` to the schema template and use `{{passwordFieldName}}` instead of the hardcoded string.

---

### 10. `useQuery` composable leaks registrations outside component lifecycle

**Current state:** `runtime/src/client/ofetch.ts` and the generated `useQuery.ts` composables register a refresh callback into a global `queryRegistry`. When `useQuery` is called outside a Vue component context (e.g., in a Pinia store or a top-level composable), the `onUnmounted` cleanup hook never fires. The refresh function is permanently registered and called every time `invalidateQueries` is invoked — even after the calling context is destroyed. This causes: spurious HTTP requests, memory growth in SPAs that navigate frequently, and potential double-updates.

**Fix:** Add a `{ autoCleanup: false }` option that callers outside components can opt into explicitly. In the default path, detect missing component context early and log a warning rather than silently registering a never-cleaned callback.

---

### 11. `cache` store barrel export uses `.js` extension for TypeScript projects

**Current state:** `CacheGenerator` emits a barrel file:

```ts
export * as storeName from './storeName.js'
```

In a TypeScript project this is correct for ESM resolution, but the generated TypeScript source ends in `.ts`, not `.js`. In strict TypeScript configs (which Vasp generates), importing `.js` is valid ESM but requires `"moduleResolution": "bundler"` or `"node16"`. The `tsconfig.json.hbs` correctly sets `"moduleResolution": "bundler"`, so this works — but it is fragile and inconsistent with how other barrel files are generated using `ctx.ext`.

**Fix:** Use `ctx.ext` or the `{{ext}}` template variable for the cache barrel import extension, matching the pattern used everywhere else in the generator.

---

### 12. `outbound` webhook dispatcher is inline and blocks the HTTP response

**Current state:** When a CRUD create/update/delete succeeds, the generated route calls the dispatcher function synchronously before returning the response. Even with `retry: 0` (default), a single slow or unreachable target URL adds its entire round-trip latency to the API response time. With `retry: 3`, a failing target blocks the handler for `3 × timeout` milliseconds.

**Fix:** When a PgBoss or BullMQ job executor is declared, `WebhookGenerator` should route dispatches through the job queue (already partially scaffolded via `webhookDispatch.hbs`). When no job executor is declared, use `setImmediate` / `queueMicrotask` to fire-and-forget asynchronously and document the trade-off.

---

## Tier 3 — Medium Severity (maintainability / DX)

### 13. `ScaffoldGenerator.generateMainVasp()` is a second serializer that diverges

**Current state:** `ScaffoldGenerator` re-serializes the AST back to a `main.vasp` string by walking the tree and concatenating DSL syntax strings. This second serializer must be manually kept in sync with the parser. New blocks added to the parser (e.g., `autoPage`, `webhook`, `observability`) must also be added to the serializer. They currently are not — `vasp enable-ssr` and `vasp migrate-to-ts` operate on a regenerated `main.vasp` that drops any blocks the serializer doesn't know about.

**Fix:** Store the original `.vasp` source text alongside the AST (already possible — `parse()` returns the AST; the source can be threaded through). Use the original source text verbatim when writing `main.vasp`, and for `enable-ssr`/`migrate-to-ts`, perform a targeted text replacement on the source string rather than a full re-serialization.

---

### 14. Per-generator error collection can still silently swallow cascading failures

**Current state:** `generate.ts` now uses `runGenerator()` wrappers that catch per-generator exceptions and continue the pipeline. However, if `DrizzleSchemaGenerator` (step 2) fails, the auth middleware generated in step 5 will import from a schema file that doesn't exist. The pipeline continues, but the generated app cannot start. The user sees multiple unrelated errors downstream of the real root cause.

**Fix:** Add a dependency graph: when a generator that writes a "dependency file" (schema, server entry, auth plugin) fails, mark its dependents as skipped with a clear message — "Skipped AuthGenerator because DrizzleSchemaGenerator failed." Return all collected errors + skip messages together.

---

### 15. String transform utilities are buried in `TemplateEngine.ts` and exported from it

**Current state:** `toCamelCase`, `toPascalCase`, `toKebabCase`, `toPlural`, and related functions live inside `TemplateEngine.ts` and are exported from it. Multiple generators import from `TemplateEngine.ts` only to get string utilities:

```ts
import { toCamelCase, toPascalCase, toPlural } from "../template/TemplateEngine.js"
```

This creates a coupling where a utility import transitively loads the entire Handlebars engine, including template cache initialization.

**Fix:** Extract string utilities to `utils/string.ts`. `TemplateEngine.ts` imports from there; generators import from there directly. This is a pure refactor with no behavior change.

---

### 16. `knip` dead-code checker is not in CI or in `bun run lint`

**Current state:** `knip` is a dev dependency with a `knip.json` config. It is only run by `.claude/hooks/stop-check.sh` (a local Claude Code hook, not a CI step). The `bun run lint` script only runs ESLint. Dead exports accumulate with no signal.

**Fix:** Add `bun run knip` to the `lint` script or add it as a separate `check:dead-code` script in the CI pipeline (GitHub Actions). This is a one-line addition.

---

### 17. `admin` panel generates a separate `package.json` and Vite config with hardcoded versions

**Current state:** `AdminGenerator` writes `admin/package.json` via a template with hardcoded dependency versions (e.g., `"ant-design-vue": "^4.2.0"`). When the main project's dependencies are updated via `bun update`, the admin panel's deps are not — it gets stale dependency versions with no mechanism to update them.

**Fix:** Either make the admin panel a workspace package (`"workspaces": ["admin"]` in the root), or compute the dependency versions dynamically in `AdminGenerator` from the installed version of `ant-design-vue` in the monorepo. The simpler fix is to embed the admin panel as a workspace so `bun update` covers it automatically.

---

### 18. `deploy.ts` generates Docker/Fly/Railway configs with hardcoded port 3001

**Current state:** `cli/src/commands/deploy.ts` writes `Dockerfile`, `fly.toml`, and `railway.json` with:

```
EXPOSE 3001
PORT=3001
```

But `DEFAULT_BACKEND_PORT` is a named constant in `@vasp-framework/core`. If the user changes the port in `main.vasp` (via `backendPort` — not yet a DSL feature, but configurable via env vars), the deploy config will be wrong.

**Fix:** Read `DEFAULT_BACKEND_PORT` from `@vasp-framework/core` (already imported in other CLI commands) instead of hardcoding `3001` in deploy config templates.

---

### 19. Handlebars template errors surface only at render time, not at load time

**Current state:** `TemplateEngine.loadDirectory()` pre-compiles all `.hbs` files. Compile errors (malformed Handlebars syntax) are caught and thrown at this stage. However, **rendering errors** (referencing a partial that doesn't exist, the triple-brace `}}}` trap) only surface at `render()` call time, which is mid-generation. The error message from Handlebars is usually cryptic ("Parse error on line N: …").

**Fix:** Add a "dry-run render" pass in CI that renders every template with a fixture AST and catches all render-time errors before they can affect a real generation run. This is essentially what the E2E test suite does, but targeting template correctness specifically.

---

### 20. `valibotSchema` helper uses `optional()` wrapping inconsistently for nullable fields

**Current state:** `valibotSchema.ts` wraps nullable, non-required fields with `v.optional(v.nullable(schema))`. Valibot's semantics: `v.optional` means the key can be absent from the object; `v.nullable` means the value can be `null`. In Vasp's CRUD create/update request bodies, a nullable field (e.g., `content: Text @nullable`) should accept `null` as a value but the key should still be present in the body. Wrapping with `optional()` allows the client to omit the field entirely — a different semantic that can silently write `undefined` to the DB where `null` was intended.

**Fix:** Distinguish between "nullable in DB" (`@nullable` → `v.nullable(schema)`) and "optional in request body" (no equivalent DSL concept yet). Use `v.nullable(schema)` for `@nullable` fields without the `v.optional()` wrapper. Add a separate `@optional` or form-level concept when truly optional request body fields are needed.

---

## Tier 4 — Low Severity / Quality of Life

### 21. `vasp migrate-to-ts` and `vasp enable-ssr` don't validate the current project state

Both commands assume they are running inside a valid Vasp project with a parseable `main.vasp`. Neither runs a parse step before operating. If `main.vasp` has a syntax error from a previous bad `vasp add` invocation, these commands will silently produce incorrect output.

**Fix:** Add `parse(readFileSync('main.vasp'))` at the start of both commands. If it fails, print the diagnostic and exit.

---

### 22. `VaspError` in the generated server is not serialized consistently across all middleware

The `errorHandler.hbs` middleware catches `VaspError` and returns `{ ok: false, error: { code, message, hint? } }`. However, Elysia's own validation errors (from `t.Object(…)` schemas) throw a different shape that bypasses the error handler. A request body with a missing required field returns Elysia's native `{ type: "validation", on: "body", … }` shape — not the Vasp envelope. Frontend code using `createVaspClient` receives an unexpected shape.

**Fix:** Add an `onError` hook in `server/index.hbs` that wraps Elysia's own validation errors into the standard `{ ok: false, error: { code: "VALIDATION_ERROR", message, … } }` envelope.

---

### 23. `ScaffoldGenerator` creates test stubs that reference non-existent imports

The test scaffold (`tests/crud/*.test.hbs`, `tests/auth/*.test.hbs`) imports from `@vasp-framework/runtime` and from generated files like `server/auth/index.ts`. These files may not exist when the tests are run (e.g., in a minimal app with no auth block). The test files compile but fail at import resolution time.

**Fix:** Guard generated test scaffold files with the same feature flags used in generators (e.g., only emit `tests/auth/` when `hasAuth`, etc.).

---

### 24. No `@deprecated` markers on DSL features that are being superseded

The `autoPage` block was introduced to supersede manual `route` + `page` + custom CRUD composable patterns. The `crud.list.search` feature partly overlaps with `query`. No deprecation markers or migration hints exist in the language server hover docs or in `SemanticValidator` warnings.

**Fix:** Add `DiagnosticSeverity.Information` (not Error) diagnostics for patterns that have better alternatives, surfaced in the VS Code extension as info/hint underlines.

---

### 25. `Manifest` schema snapshot does not track enum values — type changes to enums are missed

`detectDestructiveSchemaChanges()` compares column types. For an `Enum` column, it stores `type: "Enum"` but not the enum variants. If a user changes `Enum(active, inactive)` to `Enum(active, inactive, archived)` — a safe additive change — no warning is produced. But if they change `Enum(active, inactive, archived)` to `Enum(active, inactive)` — a destructive deletion — no warning is produced either. The snapshot is incomplete.

**Fix:** Extend `FieldSnapshot` with `enumValues?: string[]` and populate it in `buildSchemaSnapshot()`. In `detectDestructiveSchemaChanges()`, check for removed enum variants and emit a warning.

---

## Recommended Action Order

| Priority | Area | Item | Effort |
|---|---|---|---|
| 1 | **Security/Correctness** | Fix `schema.hbs` hardcoded `users` table + `passwordHash` (Items 1, 9) | S |
| 2 | **Security** | Auto-enforce `JWT_SECRET` startup crash when auth is declared (Item 3) | S |
| 3 | **Security** | Sanitize CRUD filter field names against an entity-derived allowlist (Item 5) | M |
| 4 | **CI** | Add `language-server` + `vscode-extension` to `bun run build` + `typecheck` (Item 2) | S |
| 5 | **Testing** | Add `tsc --noEmit` E2E step on generated TypeScript projects (Item 6) | M |
| 6 | **Correctness** | Conditional `googleId`/`githubId` columns in schema (Item 4) | S |
| 7 | **Reliability** | `vasp add` parser round-trip validation before writing (Item 7) | M |
| 8 | **Reliability** | Retire Chevrotain CST visitor as symbol-table source; derive from `VaspAST` (Item 8) | L |
| 9 | **Reliability** | Outbound webhooks via job queue, not inline (Item 12) | M |
| 10 | **DX** | Fix `useQuery` memory leak outside component context (Item 10) | S |
| 11 | **Correctness** | Generator dependency graph + cascading skip messages (Item 14) | M |
| 12 | **Maintainability** | Replace `ScaffoldGenerator` re-serializer with verbatim source round-trip (Item 13) | M |
| 13 | **Maintainability** | Extract string utilities from `TemplateEngine.ts` to `utils/string.ts` (Item 15) | S |
| 14 | **CI** | Add `knip` to CI pipeline (Item 16) | S |
| 15 | **Correctness** | Fix `valibotSchema` `optional()` vs `nullable()` semantics (Item 20) | S |
| 16 | **DX** | Standardize Elysia validation errors into Vasp envelope (Item 22) | M |
| 17 | **DX** | Admin panel as a workspace package (Item 17) | M |
| 18 | **Correctness** | Enum variant tracking in schema snapshot (Item 25) | S |
| 19 | **DX** | Guard test scaffold files with feature flags (Item 23) | S |
| 20 | **DX** | `vasp migrate-to-ts`/`enable-ssr` parse validation at entry (Item 21) | S |

---

## What Is Already Working Well (Do Not Break)

- **Three-phase staging pipeline** — the `staging → commit → cleanup` pattern is robust. Never go back to writing directly to the output dir.
- **Manifest-driven orphan cleanup** — `deleteOrphanedFiles` correctly handles user-modified files.
- **Exhaustiveness checker** (`scripts/check-exhaustiveness.ts`) — catches missing switch cases without needing TypeScript project references. Keep it in CI.
- **`runGenerator()` isolation** — per-generator try/catch is the right model; just extend it with dependency tracking (Item 14).
- **`parseAll()` in language server diagnostics** — the unification of diagnostic reporting via `@vasp-framework/parser` was the right call. Build on it for completions/hover too.
- **`@exhaustiveness-partial`** annotation system — pragmatic and explicit. Keep using it.
- **`detectDestructiveSchemaChanges()`** — genuinely useful protection. Extend it with enum variants (Item 25).
- **`BaseTemplateData` typed interface** — prevents silent Handlebars rendering failures. Keep extending it as new template data is added.
- **Rate limiter sliding window** — the `rateLimit.hbs` implementation correctly uses true sliding window (not fixed window). The in-memory caveat is documented. Keep as-is until Redis is a declared dependency.
- **E2E Playwright suite** — the fullstack suite is comprehensive. It's the best safety net the project has.
