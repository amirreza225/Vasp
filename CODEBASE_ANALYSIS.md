# Vasp Codebase — Deep Analysis & Honest Assessment

> **Scope:** Every package (`core`, `parser`, `generator`, `runtime`, `cli`,
> `language-server`, `vscode-extension`), all Handlebars templates, all tests,
> and all scripts were read in full before writing this document.
>
> Issues are grouped by severity tier. Within each tier they are ordered by
> impact on correctness, security, maintainability, and future expansion
> capability.

---

## Tier 1 — Critical (correctness / security / architectural) 

### 1. Two completely separate parsers that must be kept in sync manually Done ✅

`packages/parser/` contains a hand-written recursive-descent parser (≈2,840
lines). `packages/language-server/src/grammar/` contains an entirely
independent Chevrotain CST parser (≈1,420 lines) that was written separately
and intentionally produces a *different*, lighter AST.

**The problem:** Every new DSL feature requires changes in both parsers. The
LSP parser's own comment admits it cannot produce the full `VaspAST`:

> *"We don't attempt to produce the full VaspAST … since that requires the
> complete CLI parser logic."*

Consequences in practice today:
- Semantic checks added to `SemanticValidator` (E118–E126) are **not** wired
  into LSP diagnostics. The editor shows no error; the CLI fails at build time.
- Completions (in `completions.ts`) and hover docs may describe features the
  LSP parser doesn't actually understand yet.
- Error messages for the same mistake differ between `vasp generate` and the
  VS Code extension.

**Best fix:** The language server should import and use
`@vasp-framework/parser` directly (via `parse()` + `collectDiagnostics()`),
keeping the Chevrotain grammar only for fault-tolerant position tracking.
The CST visitor can be repurposed to produce the go-to-definition / completion
symbol index while the full validator runs separately.

---

### 2. `commitStagedFiles` never deletes orphaned generated files Done ✅

When a user removes a `crud`, `query`, `action`, or `entity` block and
re-runs `vasp generate`, the previously generated files **are never deleted**.
`commitStagedFiles()` in `utils/fs.ts` only copies and overwrites — it
contains the comment `"it never deletes from the real output dir"`.

The `Manifest` class already tracks every generated file with its content
hash and source generator. The data needed to compute the diff (old manifest
vs new manifest) is present. It is just not used for cleanup.

Accumulated dead code in a Vasp project grows linearly with the number of
blocks ever removed. Drizzle columns stay orphaned in the schema, server
routes continue to be imported and registered, and test files reference
functions that no longer exist — all silently.

**Best fix:** After `commitStagedFiles` succeeds, load the previous manifest
from disk, diff the two sets of tracked files, and `rmSync` any file in the
old set that is not in the new set and has not been modified by the user
(verified via content hash).

---

### 3. Auth middleware hardcodes `users` and `passwordHash` — ignores `userEntity` Done ✅

`templates/shared/auth/server/middleware.hbs` unconditionally imports:

```ts
import { users } from '../../drizzle/schema.{{ext}}'
const [user] = await db.select().from(users).where(eq(users.id, …))
const { passwordHash: _ph, ...safeUser } = user
```

The DSL explicitly supports `auth MyAuth { userEntity: Account }`. If the
user entity is named anything other than `User`, the generated server
**will not compile** — `users` does not exist in the schema, and neither does
`passwordHash` if the field is named differently.

The same issue appears in `providers/usernameAndPassword.hbs`. The schema
template (`schema.hbs`) correctly uses the entity name, but the auth logic
does not follow suit.

**Best fix:** `AuthGenerator.ts` already resolves `userEntity` and passes
`passwordField`. These values must be threaded into the middleware template:
the table const name must be derived from `userEntity` (e.g., `accounts`
instead of `users`), and the password field exclusion must use the resolved
`passwordFieldName`.

---

### 4. `schema-level` and `database-level` multi-tenancy silently do nothing Done ✅

The DSL, parser, and semantic validator all accept:

```vasp
app MyApp {
  multiTenant: {
    strategy: schema-level   ← accepted
    strategy: database-level ← accepted
  }
}
```

`CrudGenerator.ts` checks `mt?.strategy === "row-level"` and skips the
isolation logic for anything else. No other generator produces schema-level or
database-level isolation code. No warning is emitted. The app is generated
as if `multiTenant` were absent.

This is a broken promise to users selecting those strategies. Either the
strategies should be rejected by `SemanticValidator` until implemented
(with a clear `E_NOT_YET_IMPLEMENTED` diagnostic), or they should be
implemented.

---

### 5. JWT_SECRET insecure fallback can silently reach production Done ✅

`middleware.hbs`:

```js
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'vasp-dev-secret-do-not-use-in-production'
)
```

The warning is logged during startup but the server continues. A misconfigured
container in production will accept tokens signed with the public fallback
secret — anyone can forge a JWT.

The `app.env` DSL block exists precisely to enforce startup validation.
Auth-related env vars (`JWT_SECRET`, `DATABASE_URL`) should be **automatically
injected** into the env validation block by `AuthGenerator`, not left to the
user to remember.

---

## Tier 2 — High severity (reliability / expansion friction)

### 6. Generated Drizzle schema has `// @ts-nocheck` at the top Done ✅

`schema.hbs` opens with `// @ts-nocheck`. This was added to avoid fighting
Drizzle's complex generic types, but it means:
- Typos in field names (e.g., `todos.titel`) are never caught by TypeScript.
- IDE intellisense for the schema is disabled.
- Any type error introduced by a generator bug in schema data is hidden.

A better approach: use `drizzle-orm`'s own exported types narrowly rather
than disabling the checker for the entire file.

---

### 7. Auth register/login responses bypass the standard error envelope Done ✅

`providers/usernameAndPassword.hbs` returns raw objects on error:

```js
return { error: 'Username already taken' }   // ❌ not the envelope
return { error: 'Failed to create user' }    // ❌
```

Every other Vasp endpoint uses `{ ok: false, error: { code, message } }` via
`VaspError`. The auth endpoints return a different shape, breaking client-side
`useAuth` which calls through `createVaspClient` and expects the standard
envelope. The `unwrapEnvelope()` function in `ofetch.ts` checks for `.ok`;
plain `{ error: "…" }` is passed through as success data.

---

### 8. Single generator failure silently aborts all subsequent generators Done ✅

`generate.ts` wraps the entire generator sequence in one `try/catch`. If
`BackendGenerator` (step 3 of 19) throws, generators 4–19 never run. The
staging directory is cleaned up and `generate()` returns
`{ success: false, errors: [message] }`. With `logLevel: "silent"` (used in
all tests), neither the error nor the missing files are surfaced.

Many test failures manifest as "ENOENT: file not found" because a failure in
an early generator prevents later generators from writing files. The root
cause is invisible.

**Better approach:** collect per-generator errors and continue. Return all
errors together at the end. Only abort if a dependency is structurally missing
(e.g., schema not written when auth middleware needs it).

---

### 9. `language-server` and `vscode-extension` are excluded from `bun run build` Done ✅

Root `package.json`:

```json
"build": "bun run --filter '@vasp-framework/core' build && … && bun run --filter 'vasp-cli' build"
```

Neither `@vasp-framework/language-server` nor `vasp-vscode` are included.
They can fall arbitrarily behind the rest of the codebase with no CI signal.
`bun run typecheck` also covers only the packages listed in
`tsconfig.base.json`'s references — verify this includes the LS.

---

### 10. Template data is completely untyped — silent rendering failures Done ✅

Every generator calls `this.render(key, data)` where `data` is
`Record<string, unknown>`. Handlebars silently treats missing keys as empty
string / falsy. A typo in a key name in a generator (e.g., `operaions`
instead of `operations`) produces a template that renders with all `{{#if}}`
blocks skipped and no error.

This has already caused real bugs (e.g., the `}}}` triple-brace trap
documented in CLAUDE.md). There is no schema validation between generator
output data and template expectations.

**Best fix:** Define a typed interface per template (e.g.,
`CrudTemplateData`) and validate at render time in development builds.

---

### 11. No destructive schema migration warning Done ✅

When a field is renamed or its type changes and `vasp generate` is re-run,
`DrizzleSchemaGenerator` produces a new schema. Drizzle's `push` will
**drop and recreate** the column — destroying data. There is no warning to
the user. The `vasp generate` command completes successfully and only
`vasp db push` later reveals the problem (and by then it may have already
executed).

---

### 12. Plural table naming is naive English-only Done ✅

`DrizzleSchemaGenerator` generates `${toCamelCase(entity.name)}s` for every
table. This produces `persons` instead of `people`, `categorys` instead of
`categories`, `statuss` instead of `statuses`, and `addresss` instead of
`addresses`. The CRUD routes and admin panel use the same pluralisation.

A minimal pluralisation library (or a simple set of rules) would eliminate
the most common cases.

---

## Tier 3 — Medium severity (maintainability / developer experience)

### 13. Rate limiter has several practical problems Done ✅

`rateLimit.hbs` uses an in-memory `Map` with a `setInterval` cleanup:

- **Not distributed:** In any multi-replica deployment (Docker, K8s, serverless)
  each instance has its own counter. The effective limit per IP is
  `MAX_REQUESTS × replicas`.
- **setInterval leaks:** The interval runs forever. In tests that spin up and
  tear down the server, the interval prevents clean exit.
- **Sliding window is actually a fixed window:** The "window" resets from
  `entry.start`, not from the last request. Burst attacks can make exactly
  `MAX_REQUESTS` requests at 00:59 and `MAX_REQUESTS` more at 01:01.

The login-specific rate limiter in `usernameAndPassword.hbs` has the same
fixed-window implementation.

---

### 14. `useQuery` leaks registrations outside a component context Done ✅

`useQuery.ts`:

```ts
} else {
  // Outside a component — register globally (never auto-unregistered)
  registerQuery(queryName, refresh);
  refresh();
}
```

Any Pinia store or top-level composable that calls `useQuery()` registers a
refresh function that is never removed from `queryRegistry`. Every call to
`invalidateQueries` then re-fetches on behalf of a potentially destroyed
component, causing memory growth and spurious network requests.

---

### 15. Template engine helpers embed complex business logic untested

`TemplateEngine.ts` contains the `valibotSchema` and `drizzleColumn` helpers
— complex mapping logic covering 9 field types, nullability, enum variants,
validation chains, and Drizzle column modifiers. These are tested only
indirectly through full template renders. Bugs in the mapping (e.g., `Float`
mapping to the wrong Drizzle type, nullable enum being non-optional) are hard
to isolate.

These helpers should be extracted to dedicated, directly unit-tested modules.

---

### 16. Auth register endpoint exposes all non-password user fields

`usernameAndPassword.hbs` strips only `passwordHash`:

```js
const { passwordHash: _ph, ...safeUser } = user
return safeUser
```

If the user entity has other sensitive fields (e.g., `stripeCustomerId`,
`internalScore`, `secretToken`), they are returned to the registering client.
There is no concept of a `@hidden` field modifier or a configurable allowlist
of safe-to-return fields.

---

### 17. `vasp add` command does not trigger exhaustiveness checks

`packages/cli/src/commands/add.ts` appends DSL blocks to `main.vasp` and
then calls `runRegenerate()`. However, it generates block text by string
concatenation, not by going through the AST round-trip. If `add.ts` generates
a subtly malformed block, the subsequent parse will fail with a confusing
error.

---

### 18. Test coverage validates file existence, not correctness

Generator tests (`generate.test.ts`, `crud-list-config.test.ts`, etc.) almost
exclusively call `existsSync()` and `readFileSync().contains()`. They verify:
- That a file was created
- That the file contains a specific string

They do **not** verify:
- That the generated TypeScript/JavaScript is syntactically valid
- That the generated `package.json` is valid JSON with all required keys
- That the generated Drizzle schema actually compiles with `tsc`
- That the generated Valibot schemas match the entity field types

Adding a `bun run tsc --noEmit` step against a generated project (in a
temporary directory) in the E2E suite would catch a large class of generator
regressions.

---

### 19. `outbound` webhook dispatcher is fire-and-forget in-process

The generated `_outbound.hbs` webhook dispatcher runs inline in the route
handler. A slow or unreachable target URL will block the HTTP response. The
`retry: n` option generates a retry loop in-process, so a job that exhausts
retries holds the handler open for `n * delay` milliseconds.

For production reliability, outbound webhooks should be dispatched through
an existing background job (PgBoss, BullMQ) rather than synchronously in the
request handler.

---

### 20. The `env:` sub-block does not auto-include auth/db vars

The `app.env` sub-block is excellent for startup validation, but the
generators do not **automatically inject** variables they know are required
(e.g., `JWT_SECRET`, `DATABASE_URL`, `GOOGLE_CLIENT_ID` when google auth is
enabled). Users must remember to declare them manually. The `middleware.hbs`
fallback-to-insecure-default issue (item 5) exists partly because there is no
automatic enforcement.

---

## Tier 4 — Low severity / quality of life

### 21. `.env` is always overwritten on regeneration (minor data loss risk)

`commitStagedFiles` only preserves `.env` when `DATABASE_URL` is
non-placeholder. If the user has manually added `STRIPE_SECRET_KEY` to `.env`
but `DATABASE_URL` is still the placeholder default, a re-generate will
overwrite `.env` and delete `STRIPE_SECRET_KEY`. The preservation logic should
check for *any* non-placeholder value in `.env`, not only `DATABASE_URL`.

---

### 22. `ScaffoldGenerator.generateMainVasp()` is a second serialiser

`ScaffoldGenerator` reconstructs `main.vasp` by walking the AST and
concatenating strings. This is a second, independently-maintained serialiser
that must be kept in sync with the parser. When new DSL features are added
(e.g., `autoPage`, `webhook`), both the parser and the re-serialiser must be
updated. Consider storing the original source verbatim from `parse()` and
writing that back unchanged.

---

### 23. `toCamelCase` in `TemplateEngine` is exported and used outside

`toCamelCase` and `toPascalCase` from `TemplateEngine.ts` are imported by
multiple generators. The string transform utilities are incidental to the
template engine and should live in a dedicated `utils/string.ts` module.

---

### 24. `knip.json` dead-code checker is configured but not in CI

`knip` is listed as a dev dependency and there is a `knip.json`. It is
referenced only in `.claude/hooks/stop-check.sh` (a local Claude Code hook).
Running `bun run knip` is not part of `bun run lint` or any CI step. Dead
exports accumulate silently.

---

## Recommended action order

| Priority | Area | Fix |
|---|---|---|
| 1 | Architecture | Unify parsers: LSP reuses `@vasp-framework/parser` |
| 2 | Correctness | Manifest-driven stale file cleanup in `generate.ts` |
| 3 | Security | Fix `users`/`passwordHash` hardcoding in auth templates |
| 4 | Security | Auto-inject required env vars; make JWT_SECRET startup-fatal |
| 5 | Correctness | Guard or implement schema/database multi-tenant strategies |
| 6 | Reliability | Standard error envelope in auth provider templates |
| 7 | Reliability | Per-generator error collection; don't abort entire pipeline |
| 8 | Build | Add `language-server` + `vscode-extension` to build script |
| 9 | Type safety | Typed template data interfaces per generator |
| 10 | Quality | Extract `valibotSchema`/`drizzleColumn` to tested modules |
| 11 | DX | Add destructive migration warning in `vasp generate` |
| 12 | DX | Replace naive `+s` pluralisation with a proper utility |
| 13 | Reliability | Outbound webhooks via background job, not inline |
| 14 | Testing | `tsc --noEmit` check on a generated project in E2E suite |
| 15 | DX | Fix `useQuery` memory leak outside component context |
