# Vasp Codebase — Critical Analysis & Improvement Plan

> **Purpose**: Honest, deep-dive audit of the Vasp monorepo. Each item is
> verified against the current source. Organized by impact tier.
>
> **Scope**: Architecture, correctness, type-safety, maintainability,
> extensibility, and developer experience. Does not duplicate the PRD.
>
> **Verification date**: 2026-04-01

---

## Executive Summary

Vasp is a well-conceived project with a clean three-phase pipeline
(parse → generate → commit) and good test coverage of individual generators.
The biggest structural risk is the **Parser monolith** (2,845 lines). Beyond
that, there are several correctness hazards—some hidden by TypeScript casts,
some lurking in template rendering—and a handful of architectural decisions
that will increasingly hurt as the DSL grows. The items below are ordered
from most to least critical.

---

## Tier 1 — Critical (correctness and type-safety hazards)

### 1. `Parser.ts` is a 2,845-line God Class

**File**: `packages/parser/src/parser/Parser.ts`

**Problem**: Every block type's parse logic lives in one file: `parseEntity`,
`parseCrud`, `parseAuth`, `parseJob`, `parseAutoPage`, `parseWebhook`,
`parseObservability`, `parseCrud{List,Form}Config`, etc. At 2,845 lines it
is the hardest file in the whole codebase to read, review, diff, and extend.
Adding a new block type requires understanding and editing this one massive
file. A merge conflict in it blocks all parser work in parallel.

**Root cause**: The class started small and accumulated blocks without ever
splitting. The lexer, the main `parse()` dispatch loop, each block parser, the
error-recovery `skipToNextBlock`, and utility functions (`parseValidateArgs`,
`extractRouteParams`) all live together.

**Fix**: Introduce a `BlockParser` base class or plain interface; extract one
file per block type (e.g., `parsers/EntityBlockParser.ts`,
`parsers/CrudBlockParser.ts`). The main `Parser.ts` becomes a thin dispatch
shell that delegates to each sub-parser and owns only the `parse()` loop,
`skipToNextBlock`, and shared token-consumer helpers. Each sub-parser gets its
own unit test file.

---

### 2. `app: null as unknown as AppNode` — Type-Safety Lie

**File**: `packages/parser/src/parser/Parser.ts`, line 155

```ts
app: null as unknown as AppNode, // validated by SemanticValidator
```

**Problem**: The `VaspAST.app` property is typed as `AppNode` (non-optional),
but at construction time the parser initialises it to `null` and casts with
`null as unknown as AppNode`. Any downstream code that trusts the TypeScript
type (e.g., accesses `ast.app.name`) will crash at runtime if the `app` block
is missing and the validator hasn't yet thrown.

**Fix**: One of two approaches, in order of preference:
1. Make `app` optional in `VaspAST` (`app?: AppNode`) and add a non-null
   assertion where consumers already know `app` is present (after validation).
2. Introduce a `PartialVaspAST` intermediate type returned by the parser and
   `VaspAST` (with `app: AppNode` guaranteed) returned only after validation.

Either option restores honesty between the type and the runtime value.

---

### 3. `primitiveTypes` Set Is Duplicated Inside `parseEntity()`

**File**: `packages/parser/src/parser/Parser.ts`, lines ~695–704

```ts
const primitiveTypes = new Set([
  "String", "Int", "Boolean", "DateTime",
  "Float", "Text", "Json", "Enum", "File",
]);
```

**Problem**: This set is re-created on every call to `parseEntity()`. More
importantly, it is a manual copy of `SUPPORTED_FIELD_TYPES` from
`packages/core/src/constants.ts`. When a new primitive type is added (e.g.,
`BigInt`) the developer must update the constant *and* this inline set. The
exhaustiveness checker (`check-exhaustiveness.ts`) will not catch the drift
because it operates on `.ts` files in `packages/`, not inline sets inside
parser methods.

**Fix**: Import and reuse `SUPPORTED_FIELD_TYPES`:

```ts
import { SUPPORTED_FIELD_TYPES } from "@vasp-framework/core";
// ...
const primitiveTypes = new Set(SUPPORTED_FIELD_TYPES);
```

This is a two-line change with zero risk and eliminates the drift entirely.

---

### 4. VaspAST Has Inconsistent Collection Optionality

**File**: `packages/core/src/types/ast.ts`

```ts
export interface VaspAST {
  app: AppNode;
  auth?: AuthNode;          // optional
  entities: EntityNode[];   // required
  routes: RouteNode[];      // required
  // ...
  storages?: StorageNode[];  // optional
  emails?: EmailNode[];      // optional
  caches?: CacheNode[];      // optional
  webhooks?: WebhookNode[];  // optional
  autoPages?: AutoPageNode[]; // optional
  apis?: ApiNode[];          // optional
  middlewares?: MiddlewareNode[]; // optional
}
```

**Problem**: Seven collections are optional (`?`) while eight are always-arrays.
There is no semantic reason for this split—all represent zero-or-more blocks
in the DSL. Every generator and the semantic validator must use `?? []` guards
constantly. `baseData()` in `BaseGenerator` repeats this pattern 8 times
(`ast.storages ?? []`, `ast.emails ?? []`, etc.). The parser initialises
optional ones with `??=` on first push, which means they start as `undefined`
rather than `[]`.

**Fix**: Normalise all collections to non-optional empty arrays in `VaspAST`.
Update the parser's initial AST object to include `storages: []`, `emails: []`,
etc. Remove all `?? []` guards from downstream code. This is a mechanical
refactor that makes the type the true invariant after parsing.

---

### 5. `baseData()` Is Recomputed on Every Template Render

**File**: `packages/generator/src/generators/BaseGenerator.ts`

```ts
protected render(key: string, data = {}): string {
  return this.engine.render(key, { ...this.baseData(), ...data });
}
```

**Problem**: `baseData()` is called for every single template render. It
performs non-trivial work on each call: 8 `?? []` guards, 30+ boolean
flag computations (every one involves `.some()` on arrays), `PRIMARY_SHADES`
array construction inside `resolveUIConfig()`, and building `adminEntities`
by mapping names to entity objects. A generator like `FrontendGenerator`
renders dozens of templates; each one recomputes the same immutable data.

**Fix**: Memoize `baseData()` on the first call using a lazily-initialised
private field:

```ts
private _baseData?: BaseTemplateData;
protected baseData(): BaseTemplateData {
  return (this._baseData ??= this.computeBaseData());
}
private computeBaseData(): BaseTemplateData { /* existing logic */ }
```

Since all generators are constructed fresh per-run and the AST is immutable
during generation, there is no cache-invalidation issue.

---

### 6. Template Data Is Completely Untyped at the Handlebars Boundary

**File**: `packages/generator/src/generators/BaseGenerator.ts`

```ts
protected render(
  templateKey: string,
  data: Partial<BaseTemplateData> & Record<string, unknown> = {},
): string {
  return this.engine.render(templateKey, { ...this.baseData(), ...data });
}
```

**Problem**: Each generator extends `render()` with a `data` parameter typed
as `Partial<BaseTemplateData> & Record<string, unknown>`. This means any extra
key a generator passes (e.g., `authMethods`, `userTableName`, `withRelations`)
is untyped. Handlebars templates silently get `undefined` for missing or
misspelled keys. There is no compile-time check that a template's required
data keys are supplied. The `}}}` triple-brace trap (documented in CLAUDE.md)
is one symptom of the same class of problems—template bugs that only surface
at runtime or during testing.

**Fix**: Introduce per-generator typed data interfaces that extend
`BaseTemplateData`. Make the second `render()` argument require the exact
expected type for each call site. A lighter-weight alternative is a Handlebars
strict mode wrapper (Handlebars 4.x supports `{ strict: true }`) that throws
on any access to an undefined data key, surfacing template data mismatches
immediately during test runs.

---

## Tier 2 — High Impact (maintainability and expansion blockers)

### 7. Language Server Dual-Parser Architecture Is a Maintenance Burden

**Files**: `packages/language-server/src/grammar/VaspParser.ts` (657 lines),
`VaspLexer.ts`, `VaspCstVisitor.ts`

**Problem**: The language server maintains two completely separate parsers:
1. **The real parser** (`@vasp-framework/parser`) — used for diagnostics.
2. **The Chevrotain grammar** — a duplicate implementation used for
   fault-tolerant CST needed by completions, hover, and go-to-definition.

Any new DSL block type must be added to:
- `packages/parser/src/lexer/Lexer.ts` + `TokenType.ts`
- `packages/parser/src/parser/Parser.ts`
- `packages/language-server/src/grammar/VaspLexer.ts`
- `packages/language-server/src/grammar/VaspParser.ts`
- `packages/language-server/src/features/completions.ts` (828 lines)
- `packages/language-server/src/utils/context-detector.ts`
- `packages/language-server/src/utils/vasp-docs.ts`

Six files for every new block type, and the Chevrotain grammar silently drifts
from the real parser between changes.

**Fix**: The right long-term architecture is an error-recovering mode in the
real parser. The real parser already has `skipToNextBlock()` for error
recovery. Extending it to produce a partial AST (with null/placeholder nodes
for unparsed blocks) would let the language server use a single parser and
retire the Chevrotain grammar entirely. This is the most impactful
architectural change after the Parser split.

---

### 8. `vasp add` Uses String Concatenation to Generate DSL — No Round-Trip Serialiser

**File**: `packages/cli/src/commands/add.ts`

**Problem**: The `addCommand` appends new blocks to `main.vasp` by
string-templating raw DSL text. If the DSL grammar changes (e.g., a field is
renamed, a new required property is added), the `add` command silently
generates syntactically or semantically invalid blocks. The generated stubs
use `{ db: any; user?: any; args?: any }` type annotations—these should be
generated using the actual entity types from the AST.

Additionally, `vasp add` only supports 8 of the 20 block types: entity, page,
crud, query, action, job, auth, api. Missing: storage, email, cache, webhook,
observability, autoPage, realtime, route, seed.

**Fix**:
1. Implement an AST-to-DSL serialiser (`AstSerializer`) in the parser package
   that converts any `VaspNode` back into formatted DSL text. The `add`
   command then constructs a proper AST node and serialises it.
2. Expand coverage to all block types.
3. Use the entity's actual field types in generated stubs.

---

### 9. No Incremental Generation — Everything Regenerates on Any Change

**File**: `packages/generator/src/generate.ts`, `packages/cli/src/commands/start.ts`

**Problem**: Every `vasp generate` and every watch-mode file-change event
runs all 19 generators unconditionally and copies all generated files. For a
large app this means:
- All template renders happen even when unrelated blocks changed.
- All files are copied from the staging dir (changing mtimes and triggering
  Vite's HMR for unchanged files).
- The developer waits for the full pipeline even for a one-word edit.

**Fix — two independent improvements**:
1. **Skip unchanged files during commit**: In `commitStagedFiles`, compare
   each staged file's SHA-256 hash against the hash of the existing file in
   the real output dir. Copy only when the content differs. This is a small
   change with big DX impact (no spurious HMR triggers).
2. **Generator dependency graph**: Build a map from block type → generator(s)
   it affects. On re-generation, diff the new AST against the previous one
   (stored in the manifest) and only run generators whose inputs changed.
   The manifest already stores a schema snapshot — this pattern can be
   extended to all block types.

---

### 10. Destructive Schema Change Detection Is Incomplete

**File**: `packages/generator/src/generate.ts`, `detectDestructiveSchemaChanges()`

**Problem**: The function only warns about:
- Entity (table) removal
- Column removal
- Column type change

It is silent about:
- A column changing from nullable to not-null (will fail `db push` if null rows exist)
- A new unique constraint being added (will fail if duplicate values exist)
- An enum value being removed (existing rows with the removed value will violate the constraint)
- A column being renamed (Drizzle treats rename as drop + add, destroying data)

**Fix**: Extend `detectDestructiveSchemaChanges` to also detect:
- Nullable → not-null changes on existing columns
- New unique constraints on existing tables
- Enum value removals
- Index type changes (regular → fulltext and vice versa)

Each deserves a clear warning message with the recommended manual migration
step (e.g., "backfill nulls before pushing", "verify no duplicates before
adding UNIQUE").

---

### 11. Two Overlapping Field-Validation Systems Are Partly Disconnected from Code Generation

**Files**: `packages/core/src/types/ast.ts`, `packages/generator/src/template/valibotSchema.ts`

**Problem**: Two distinct types represent field-level validation:

- `FieldValidation` — populated from `@validate(email, minLength: 3)` modifiers.
  Used by `valibotSchema()` to generate Valibot schema expressions in
  `shared/validation.{ext}`.
- `FieldValidateConfig` — populated from the nested `validate { required, pattern, custom }`
  config block (v2 DSL). Only checked by `SemanticValidator.checkFieldConfigValidation()`.
  The generator does not currently use these rules to produce Valibot schemas or
  form validation in `autoPage`/CRUD form templates.

So `validate { required: true, minLength: 3 }` in a field config block is
silently ignored at generation time — it does not affect the generated
validation schema. This is a silent correctness gap.

**Fix**: Merge both validation paths in `valibotSchema()` and in the CRUD/autoPage
template data. When a field has a `config.validate`, that takes precedence
over the `@validate(...)` modifier. This makes the richer config-block syntax
actually work end-to-end.

---

### 12. `resolveServerImport` Depth Calculation Is Fragile

**File**: `packages/generator/src/generators/BaseGenerator.ts`

```ts
protected resolveServerImport(source: string, fromDir: string): string {
  if (!source.startsWith("@src/")) return source;
  const depth = fromDir.replace(/\/$/, "").split("/").length;
  const prefix = "../".repeat(depth);
  return prefix + source.slice(1);
}
```

**Problem**: The relative-path calculation is based on counting `/` separators
in `fromDir`. When a template is nested in a new subdirectory or a generator
calls this with a different `fromDir`, the output path silently becomes wrong.
There is no runtime assertion or test that validates the resulting relative
path resolves correctly.

**Fix**: Replace the ad-hoc counter with `node:path`'s `relative()`:

```ts
protected resolveServerImport(source: string, fromDir: string): string {
  if (!source.startsWith("@src/")) return source;
  const srcRelPath = source.slice("@src/".length); // e.g. "queries.js"
  const absoluteSrcPath = join(this.ctx.outputDir, "src", srcRelPath);
  const absoluteFromDir = join(this.ctx.outputDir, fromDir);
  return relative(absoluteFromDir, absoluteSrcPath);
}
```

This is correct for any nesting depth and will not silently break when
templates are reorganised.

---

## Tier 3 — Architectural Debt (future-proofing)

### 13. Admin Panel Is a Completely Separate Vite Application

**File**: `packages/generator/src/generators/AdminGenerator.ts`,
`templates/admin/`

**Problem**: The generated admin panel lives in `admin/` with its own
`package.json`, `vite.config`, `node_modules`, and build pipeline. This
means:
- `bun install` must run in two directories (`/` and `admin/`).
- Deployment requires serving two separate origins or a reverse-proxy rule.
- Two Vite processes run in development (`dev:server` + `dev:client` +
  `dev:admin`).
- Any shared type or utility must be duplicated across both apps.
- The admin app generates 15–20 files on every regeneration regardless of
  whether admin-visible entities changed.

**Fix**: Move the admin panel into the main SPA/SSR frontend as a lazy-loaded
route group (e.g., `/admin/**`). For SPA, this is a Vite code-split chunk.
For SSR, it is a Nuxt layout + page group. The admin API router (already
generated inside `server/routes/admin/`) stays as-is. This eliminates the
separate Vite process, the second `node_modules`, and the reverse-proxy
complexity.

---

### 14. No Plugin or Extension System

**Problem**: There is no way for users to add a custom generator, override
a Handlebars template, register a custom DSL block, or add a Handlebars
helper without forking the monorepo. This means every team-specific need
(company-specific auth patterns, internal UI library instead of PrimeVue,
additional code-gen targets) requires maintaining a fork and rebasing across
Vasp releases.

**Fix**: Define a `VaspPlugin` interface:

```ts
interface VaspPlugin {
  name: string;
  /** Additional generators to run after the built-in pipeline */
  generators?: Generator[];
  /** Override or extend Handlebars templates (key = template path, value = .hbs string) */
  templateOverrides?: Record<string, string>;
  /** Additional Handlebars helpers */
  helpers?: Record<string, HandlebarsHelper>;
  /** Additional DSL block parsers (advanced — requires custom lexer integration) */
  blockParsers?: BlockParserPlugin[];
}
```

Plugins are configured in a `vasp.config.ts` file at the project root and
loaded by the CLI before generation. Template overrides use a layered lookup:
plugin templates shadow built-in templates by key. This is the same pattern
used by Nuxt modules, Vite plugins, and Prettier plugins.

---

### 15. Realtime Is Unconditionally Coupled to CRUD

**File**: `packages/parser/src/validator/SemanticValidator.ts`, `checkRealtimeEntities()`

**Problem**: The SemanticValidator (`E104_REALTIME_ENTITY_NOT_CRUD`) requires
every `realtime` block to reference an entity that also has a `crud` block.
This means realtime cannot be used for:
- Server-sent notifications (e.g., background job progress)
- Presence / online-status channels
- System-event broadcasting (e.g., deployment notifications)
- Entities where you want WebSocket updates but no REST CRUD endpoints

This is an artificial constraint rooted in the original implementation rather
than a necessary semantic requirement.

**Fix**: Make the CRUD requirement a warning, not an error. The template for
realtime (`templates/shared/server/routes/realtime/_channel.hbs`) already
handles the channel independently. The CRUD integration (auto-publishing
create/update/delete events) should be opt-in via a `pubFromCrud: true`
flag in the realtime block, not a hard prerequisite.

---

### 16. No DSL Version Number — No Safe Migration Path

**Problem**: `main.vasp` files have no version header. If the DSL syntax
changes (renamed properties, new required sub-blocks, removed modifiers), an
existing `main.vasp` will fail to parse with a cryptic error. There is no
automated migration tool that can upgrade an old `main.vasp` to a newer DSL
version.

**Fix**:
1. Add an optional `version` field to the `app` block:
   ```
   app MyApp {
     version: "1.3"
     ...
   }
   ```
2. The CLI reads this version and can run registered `DslMigration[]` transforms
   (old version → new version) before parsing. This is the same pattern
   as Prisma's `datasource` block version handling and Nuxt's `compatibilityDate`.
3. The existing `VASP_VERSION` constant in core is a good baseline for the
   initial version string.

---

### 17. No Concept of "Selective Regeneration" by Block Type

**Problem**: When a developer adds a new query to `main.vasp`, `vasp generate`
re-runs all 19 generators including `ScaffoldGenerator` (which overwrites
`package.json`, `tsconfig.json`, `README.md`) and `FrontendGenerator` (which
rewrites the entire router, all client SDK files, and every page). This is
unnecessary and risks overwriting user customisations in generated files that
the user may have legitimately modified.

**Fix**: The Manifest already tracks which generator wrote each file. The
CLI `generate` command can expose a `--only <blockType>` flag that limits
generation to the relevant generator(s). For example, `vasp generate --only
query` would run only `QueryActionGenerator` and the relevant frontend client
SDK file. The manifest diff (item 9 above) naturally enables this.

---

### 18. Generated Test Scaffolding Is Minimal Stubs

**File**: `templates/shared/tests/`

**Problem**: `ScaffoldGenerator` creates `tests/crud/`, `tests/auth/`,
`tests/queries/`, `tests/actions/` directories and a `vitest.config` file,
but the generated test files are near-empty stubs. A developer scaffolding
a new Vasp app gets no meaningful starting point for testing their queries,
actions, or CRUD endpoints. The E2E tests in `e2e/` are comprehensive but
they test Vasp itself, not the generated application.

**Fix**: Generate real test scaffolding for each block type:
- For each query: a test that calls the query function with a mock Drizzle db
  and asserts the return type.
- For each action: a test that calls the action and verifies entity mutation.
- For each CRUD entity: tests for list (with pagination), create, update,
  delete (asserting auth is required when `hasAuth`).
- An integration test helper (`tests/helpers.ts`) that sets up an in-memory
  SQLite or pg-mem database and seeds it.

---

### 19. `toPlural()` Produces Wrong Table Names for Some Entity Names, with No Escape Hatch

**File**: `packages/generator/src/template/TemplateEngine.ts`

**Problem**: `toPlural()` drives all Drizzle table names. It handles the
most common suffix rules and ~30 hand-coded irregulars, but several
entity names a developer might reasonably use will produce incorrect table
names at runtime:

| Entity name | `toPlural()` output | Correct SQL name |
|-------------|--------------------|--------------------|
| `Sheep`     | `sheeps`           | `sheep`            |
| `Deer`      | `deers`            | `deer`             |
| `Series`    | `serieses`         | `series`           |
| `Fish`      | `fishes`           | `fish`             |

More importantly, there is **no escape hatch**. If `toPlural()` gets the
table name wrong for a specific entity, the developer has no way to override
it in the DSL. They must either rename the entity or patch the framework.
Renaming the entity after data has been stored requires a manual table
rename migration.

**Fix**: Add an optional `@@tableName("custom_name")` table-level directive
to the `entity` block, similar to Prisma's `@@map`. When present, it is used
verbatim as the SQL table name instead of the auto-generated
`toPlural(camelCase(entityName))` result:

```vasp
entity Fish {
  @@tableName("fish")
  id: Int @id
  species: String
}
```

This is a two-part change: parser support for the new `@@tableName`
directive, and `DrizzleSchemaGenerator` using it when present.

---

### 20. The `vasp eject` Command Inlines the Runtime by Path Rewriting, Not Bundling

**File**: `packages/cli/src/commands/eject.ts`

**Problem**: The eject command rewrites `@vasp-framework/runtime` imports to
relative paths pointing to the copied runtime source files. This approach:
1. Copies all runtime files into the project (adding a `runtime/` directory
   to what was a clean generated app).
2. Produces relative import paths that may break if the user reorganises their
   `src/` directory.
3. Does not handle Nuxt/Vite module aliasing for the SSR case.
4. Does not update `package.json` to remove the `@vasp-framework/runtime`
   dependency.

**Fix**: The eject command should:
1. Remove `@vasp-framework/runtime` from `package.json` dependencies.
2. Copy only the composables and types the project actually uses (based on
   which blocks are present in the AST).
3. Write them to a stable `src/vasp/runtime/` path.
4. Use project-root-relative aliases (`@/vasp/runtime`) rather than fragile
   `../../..` relative paths.

---

## Tier 4 — Developer Experience Polish

### 21. `vasp start` Hot-Reload Regenerates All 19 Generators on Every Edit

**File**: `packages/cli/src/commands/start.ts`, `watchVaspFile()`

**Problem**: The file watcher debounces changes to `main.vasp` and calls
`runRegenerate(projectDir)` — the full pipeline. A developer rapidly iterating
on the DSL (adding fields, tweaking an auth config) waits for all generators
to run sequentially on each save.

**Fix**: Combined with item 9 (incremental generation), the watcher should
diff the AST and only run the generators whose data changed. A quick diff
comparing `ast.entities`, `ast.cruds`, `ast.queries`, etc. between the old
and new parse result is sufficient to determine which generators to skip.

---

### 22. Error Messages from Parser Are Not Source-Position Linked in CLI Output

**File**: `packages/cli/src/utils/parse-error.ts`

**Problem**: When a `ParseError` is thrown in the CLI (during `vasp generate`,
`vasp add`, etc.), the CLI formats and prints the error but the source
position information (`loc.line`, `loc.col`, `loc.offset`) is available only
as numbers. There is no visual "caret under the offending token" display like
Rust/TypeScript compilers produce. Developers scan the error and then have to
manually navigate to the file and count lines.

**Fix**: Render a code snippet with a `^` caret under the offending token
in the CLI error output, similar to:

```
Error E014 in main.vasp (line 23, col 5):
  Unknown route property 'middleware'
  Valid properties: path, to, protected

   21 │ route HomeRoute {
   22 │   path: "/"
   23 │   middleware: requireAuth
       │   ^^^^^^^^^^
   24 │ }
```

The `DiagnosticFormatter` already exists in the parser; the CLI just needs to
use it with the original source text.

---

### 23. Starters Are Too Few for Real-World Use Cases

**File**: `templates/starters/`, `packages/cli/src/commands/new.ts`

**Problem**: Only 4 starters exist: `minimal`, `todo`, `todo-auth-ssr`,
`recipe`. None cover:
- Multi-tenant SaaS (despite multi-tenancy being a first-class DSL feature)
- E-commerce (products, orders, payments, webhooks)
- API-first (no frontend, pure Elysia backend)
- Blog/CMS (content entities, admin panel, storage)
- Project management (teams, workspaces, tasks, permissions)

A developer evaluating Vasp for a specific domain finds no matching starter
and must piece together the DSL from scratch.

**Fix**: Add 4–5 domain-specific starters that exercise the more advanced DSL
features (multi-tenancy, webhooks, observability, multiple job executors).
Each starter should include a realistic entity model, auth, CRUD, and at least
one advanced feature so developers can see the full picture immediately.

---

### 24. `vasp validate` Command Exists but Is Not Prominently Featured

**File**: `packages/cli/src/commands/validate.ts`

**Problem**: `vasp validate` runs the parser and semantic validator and reports
errors. This is exactly what developers need before running `vasp generate`.
However, it is not mentioned in the generated `README.md`, not in the CLI
help printed for unknown commands, and not integrated into the watch loop.

**Fix**: Integrate `vasp validate` into `vasp start`'s watch loop as the
fast pre-check before invoking the full generator. Print the validate result
(pass/fail + error count) immediately so the developer sees parse errors
before waiting for all 19 generators to run and fail.

---

## Summary Table

| # | Item | Tier | Effort | Risk if ignored |
|---|------|------|--------|----------------|
| 1 | Parser.ts God Class (2,845 lines) | Critical | High | Every new block type makes it worse |
| 2 | `app: null as unknown as AppNode` type lie | Critical | Low | Silent crashes on bad .vasp files |
| 3 | `primitiveTypes` Set duplicated in `parseEntity()` | Critical | Trivial | Silent drift when new types are added |
| 4 | VaspAST inconsistent optionality | Critical | Medium | Bugs from `?? []` guards being forgotten |
| 5 | `baseData()` recomputed per render | Critical | Low | Performance degradation at scale |
| 6 | Template data untyped at Handlebars boundary | Critical | Medium | Runtime template errors not caught at build |
| 7 | Language server dual-parser architecture | High | High | Chevrotain grammar always drifts from real parser |
| 8 | `vasp add` uses string concatenation for DSL | High | Medium | Generates invalid DSL silently on syntax changes |
| 9 | No incremental generation / diff-before-copy | High | Medium | Spurious HMR triggers; slow watch loop |
| 10 | Destructive schema change detection incomplete | High | Low | Silent data-loss on null→notNull, enum removal |
| 11 | Two overlapping validation systems | High | Medium | Config-block validation rules silently ignored |
| 12 | `resolveServerImport` fragile depth calculation | High | Low | Broken imports when templates are reorganised |
| 13 | Admin panel is a separate Vite app | Architectural | High | Double build, double deps, deployment complexity |
| 14 | No plugin/extension system | Architectural | High | Forces forking for any customisation |
| 15 | Realtime unconditionally coupled to CRUD | Architectural | Low | Can't do realtime-only use cases |
| 16 | No DSL version number or migration path | Architectural | Medium | Silent breakage on DSL upgrades |
| 17 | No selective regeneration by block type | Architectural | Medium | All files regenerated for any change |
| 18 | Generated test scaffolding is empty stubs | DX | Medium | Developers start with zero test foundation |
| 19 | No `@@tableName` escape hatch for wrong plurals | DX | Low | Wrong table names with no override |
| 20 | `vasp eject` uses fragile path rewriting | DX | Medium | Eject produces hard-to-maintain code |
| 21 | Hot-reload regenerates all generators | DX | Medium | Slow iteration in `vasp start` |
| 22 | CLI parse errors lack source snippet display | DX | Low | Poor debugging experience |
| 23 | Too few domain-specific starters | DX | Low | Evaluation friction for new users |
| 24 | `vasp validate` not integrated into watch loop | DX | Trivial | Parser errors only surfaced after slow regen |

---

## Recommended Execution Order

If resources are limited, tackle in this order for maximum risk reduction:

1. **Items 3, 2, 4** — Trivial or low-effort, immediate correctness wins.
2. **Item 5** — Performance fix, two-line change.
3. **Item 10** — Schema safety, low effort, high data-safety value.
4. **Item 12** — Correctness fix, low effort.
5. **Item 9 (diff-before-copy part only)** — Big DX win, medium effort.
6. **Item 1** — Parser split, high effort, but the foundational prerequisite
   for everything that involves adding new DSL blocks.
7. **Item 7** — Dual-parser elimination; only tractable after item 1.
8. **Items 11, 6** — Validation correctness and template type safety.
9. **Items 8, 14, 13** — `vasp add` serialiser, plugin system, admin
   embedding. These are the "franchise" features for long-term adoption.

Items 15–24 are polish and can be interleaved with the above based on user
feedback and perceived priority.
