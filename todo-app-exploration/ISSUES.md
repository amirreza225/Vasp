# Vasp Framework — Todo App Creation Report

> **Author**: Exploring the Vasp framework by building a complete, beautiful Todo web app
> **Goal**: Create a full-featured todo app in a single `main.vasp` file — no manual code edits needed
> **Verdict**: Not yet possible. This document lists every blocker and what must change.

---

## What We Tried to Build

A complete, beautiful todo app with:
- User authentication (register / login / logout)
- Todo items with title, description, priority, status, due date, categories
- CRUD operations with pagination, filtering, sorting, and search
- Realtime updates (WebSocket) when todos change
- A polished PrimeVue 4 UI with the Lara theme and blue primary color
- Dark mode toggle
- Admin panel for managing todos, users, and categories
- Server-side rendering (Nuxt 4) for SEO
- TypeScript throughout

The full `main.vasp` file is in this directory.

---

## Issues Found

### 🔴 Critical — App Doesn't Work Without Manual Code Edits

---

#### Issue 1: `autoPage` uses the wrong API endpoint

**File**: `templates/autopages/list.vue.hbs`, `templates/autopages/form.vue.hbs`

The `autoPage` templates call `fetch('/api/<entity>')`, but CRUD routes are registered at `/api/crud/<entity>`.

```js
// Generated (WRONG):
const res = await fetch('/api/todo')
await fetch('/api/todo/' + id, { method: 'DELETE' })

// Correct endpoint:
const res = await fetch('/api/crud/todo')
await fetch('/api/crud/todo/' + id, { method: 'DELETE' })
```

**Impact**: Every `autoPage` list, form, and detail page fails at runtime with a 404 error. The only generated pages that have any actual UI are the `autoPage` ones — and they all break.

**Fix**: Change `'/api/{{kebabCase entityNamePascal}}'` to `'/api/crud/{{kebabCase entityNamePascal}}'` in all autoPage templates.

---

#### Issue 2: `autoPage` list's "New" button navigates to a non-existent route

**File**: `templates/autopages/list.vue.hbs`

When you define an `autoPage` with `topActions: [create]`, the generated list page adds a "New" button:

```js
// Generated (navigates to /todo-list/create — which doesn't exist)
@click="router.push('{{autoPage.path}}/create')"
```

There is no form page generated at `/todo-list/create`. To get a form page you have to define a second `autoPage` with `type: form` at exactly `/todo-list/create`. Even then, the delete action routes to `/todo-list/:id/edit` for editing, which also doesn't exist.

**Impact**: "New" button causes a 404. "Edit" button also causes a 404.

**Fix**: `autoPage` of `type: list` should automatically generate companion form and detail pages at `<path>/create` and `<path>/:id`. Or the list template should check if companion autoPage blocks exist and only show those action buttons if the corresponding pages are declared.

---

#### Issue 3: Duplicate column generated when using both explicit FK and relation field

**File**: `packages/generator/src/generators/DrizzleSchemaGenerator.ts`

If an entity declares both an explicit FK integer column (e.g., `categoryId: Int @nullable`) AND a relation field pointing to the same entity (e.g., `category: Category @nullable`), the generator emits two identical column definitions:

```ts
// drizzle/schema.ts — INVALID TypeScript (duplicate key):
categoryId: integer('categoryId'),                                                // from explicit field
categoryId: integer('categoryId').references(() => categories.id, { ... }),      // from relation field
```

The same duplication appears in:
- `shared/validation.ts` — duplicate Valibot field `categoryId` in `CreateTodoSchema`
- `src/admin/views/todo/FormModal.vue` — `emptyForm()` has `categoryId: 0, categoryId: null`

**Impact**: Generated TypeScript will not compile. The app is dead on arrival.

**Fix**: The generator should detect when an entity has both an explicit FK column AND a relation field for the same related entity and either:
  - Merge them into a single FK column definition, or
  - Throw a semantic validation error (E-code) telling the user to remove the explicit `categoryId` field when a `category: Category` relation is already declared.

---

#### Issue 4: CRUD list route ignores `filterable` and `search` configuration

**File**: `templates/shared/server/routes/crud/_crud.hbs`

The `crud` block accepts `filterable: [status, priority]` and `search: [title, description]`, but the generated CRUD list endpoint ignores all of it:

```ts
// Generated (no filtering, no search, no sorting applied):
const items = await db.query.todos.findMany({
  with: { category: true, author: true },
  limit,
  offset,
})
```

Despite importing `ilike`, `and`, `or` from `drizzle-orm`, the generated code never builds WHERE conditions from request query parameters.

**Impact**: The CRUD API accepts filter/search/sort query params but silently ignores them. Users see all records with no way to filter.

**Fix**: Generate `WHERE` conditions from the declared `filterable` and `search` field lists. The SPA (non-SSR) generated code already does this correctly for some fields — the SSR/relational query version is missing this logic.

---

### 🟠 Major — App Works But Looks and Feels Bad

---

#### Issue 5: Page components are empty placeholders

**File**: `templates/shared/auth/client/Login.vue.hbs`, custom page template

Every `page` block in the DSL generates a Vue component with zero content:

```vue
<!-- src/pages/Home.vue — what gets generated: -->
<template>
  <div>
    <h1>Home</h1>
    <p>Edit this page in src/pages/</p>
  </div>
</template>
```

Same for `Todos.vue`, `Dashboard.vue`, and any other user-defined page.

**Impact**: For a "one-shot" app creator, you must manually write all page content. The framework generates the routing layer but leaves the entire application UI to the developer. This is the #1 reason the app isn't truly "one-shot".

**What should happen**: For `autoPage` blocks this is somewhat addressed, but `page` blocks tied to `crud` or `query`/`action` declarations should optionally generate a working UI scaffold. At minimum, if a `page` is associated with a `crud` block (e.g., the same entity), the generated page component should include the CRUD composable wired to a DataTable.

---

#### Issue 6: Login and Register pages use raw HTML, not PrimeVue components

**File**: `templates/shared/auth/client/Login.vue.hbs`, `Register.vue.hbs`

Despite configuring PrimeVue with a beautiful Lara theme and blue primary color, the generated auth pages use plain HTML:

```vue
<!-- Generated Login.vue — uses raw <input> and <button>: -->
<input v-model="username" type="text" placeholder="Username" required />
<input v-model="password" type="password" placeholder="Password" required />
<button type="submit" :disabled="loading">Login</button>
```

**Impact**: The login and register pages look like unstyled 1995 HTML forms. A new user's first impression of the app is terrible.

**What should happen**: Use PrimeVue components: `InputText`, `Password`, `Button`, `Card`, `Message`. The forms should be centered, have proper spacing, and use the configured primary color.

---

#### Issue 7: No navigation bar, sidebar, or layout generated

The generated app has:
- `app.vue` / `nuxt.config.ts` with PrimeVue configured
- Individual pages with content
- An auth system

But there is **no global layout** with a navigation bar, sidebar, or any way to navigate between pages. Users are dropped into a blank page with no UI chrome.

**Impact**: Even if all the pages work perfectly, users have no way to navigate between them. They'd have to type URLs manually.

**What should happen**: Generate a default `layouts/default.vue` with:
- App title from `app.title` in the nav bar
- Links to all declared `route` blocks
- A logout button if `auth` is configured
- Responsive behavior (mobile hamburger menu on small screens)

---

#### Issue 8: Dark mode toggle is not generated

Despite configuring `darkModeSelector: ".app-dark"`, the generated app has no button or UI element to toggle dark mode. The selector is correctly wired to PrimeVue's theme system, but there's no component that adds/removes the `.app-dark` class.

**Impact**: Dark mode is configured but permanently disabled (or permanently enabled depending on the selector).

**Fix**: Generate a dark mode toggle button in the default layout that calls `document.documentElement.classList.toggle('.app-dark')` and persists the preference to `localStorage`.

---

#### Issue 9: Realtime events are not wired to the frontend

The `realtime` block generates:
- ✅ `server/routes/realtime/todoChannel.ts` — WebSocket server handler
- ✅ `server/routes/realtime/index.ts` — WebSocket route registration
- ❌ No frontend WebSocket client code

Users must manually write the WebSocket client, hook it up to the reactive state, and handle reconnection.

**Impact**: Realtime updates don't work out of the box.

**What should happen**: Generate a `composables/useRealtimeTodo.ts` (or similar) that:
- Connects to `ws://localhost:3001/realtime/todo-channel`
- Listens for `created`, `updated`, `deleted` events
- Exports a reactive method to subscribe (e.g., `const { onCreated, onUpdated, onDeleted } = useTodoRealtime()`)

---

### 🟡 Moderate — DSL/DX Friction

---

#### Issue 10: `admin` block does not accept a name, but error message is confusing

Every other block in Vasp takes a name: `entity Todo { }`, `route HomeRoute { }`, `crud Todo { }`. Naturally, you'd write `admin TodoAdmin { }`. But the admin block doesn't accept a name:

```
error[E030_EXPECTED_TOKEN]: Expected '{' but got 'TodoAdmin'
  --> main.vasp:103:7
     |
 103 | admin BeautifulTodoAdmin {
     |       ^^^^^^^^^^^^^^^^^^
```

The error message says "Expected '{'", which is cryptic. Nothing in the error explains that `admin` is different from other blocks.

**Fix**: Either:
  - Allow `admin <Name> { }` syntax (and store the name for documentation/display purposes), or
  - Improve the error message to say: "The `admin` block does not take a name. Use `admin { entities: [...] }` instead."

---

#### Issue 11: `--starter` flag requires `=` syntax (silent failure)

```bash
# This silently creates a BLANK app — no error, no warning:
vasp new my-app --starter todo

# This correctly uses the todo starter:
vasp new my-app --starter=todo
```

The `parseOptions()` function uses `args.find(a => a.startsWith('--starter='))`, which only matches the `=` form. When users type `--starter todo` (space-separated, the standard POSIX convention), they get a blank project with no indication that the starter flag was ignored.

**Impact**: New users following natural CLI conventions will be confused why their todo starter isn't applied.

**Fix**: In `parseOptions()`, also handle `--starter <value>` (next argument) form:
```ts
const starterFlagIndex = args.findIndex(a => a === '--starter');
const starter = args.find(a => a.startsWith('--starter='))?.split('=')[1]
  ?? (starterFlagIndex !== -1 ? args[starterFlagIndex + 1] : undefined);
```

---

#### Issue 12: All routes protected by default when auth is enabled

When an `auth` block exists, ALL routes are protected by default. The home/landing page also requires login. Most apps need a public landing page.

```vasp
// Must add `protected: false` explicitly — not intuitive:
route HomeRoute {
  path: "/"
  to: HomePage
  protected: false
}
```

The `protected` property exists in the parser, but it's not documented in any error message or in the generated `main.vasp`. New users won't know it exists.

**Fix**:
- Document `protected: false` in the generated `README.md` and `main.vasp` comments
- Consider inverting the default: routes are public by default, and you add `protected: true` for auth-gated routes. Or at minimum, warn during generation: "⚠ All routes are auth-protected by default. Add `protected: false` to public routes."

---

#### Issue 13: Incremental generation deletes files it claims to preserve

When running `vasp generate` a second time after modifying `main.vasp`, the output reads:

```
✓ Done: 3 added, 13 updated, 55 skipped
    55 user-modified file(s) preserved — use --force to overwrite
```

But the files from the first generation that are no longer in the new manifest are deleted as orphans. The message says "preserved" but the files are gone from disk.

**Impact**: Developers may lose generated infrastructure code (server routes, schema, etc.) when they add new blocks to `main.vasp`.

**Fix**: The "preserved" count should only reflect files that are still in the manifest and were skipped due to user modifications. Orphaned files that are deleted should be listed separately (e.g., "🗑 Deleted 55 orphaned file(s)").

---

### 🔵 Minor — Nice-to-Have for "One-Shot" Experience

---

#### Issue 14: No initial seed data or first user creation flow

A fresh app with auth enabled requires a user to exist before anything can be done. But there's no:
- Default seed script that creates a test user
- `vasp auth:create-user` command  
- In-browser first-run wizard

**Impact**: After running `vasp new` and `bun run db:push`, the app starts but you can't log in because there are no users. You must manually run SQL or write a seed function.

**Fix**: Generate a default `seed.ts` that creates a test admin user when the `auth` block is present:
```ts
await db.insert(users).values({
  username: 'admin',
  email: 'admin@example.com',
  passwordHash: await Bun.password.hash('changeme'),
})
```
Or generate a `/setup` route that is only accessible when the database is empty.

---

#### Issue 15: Auth form components don't use PrimeVue's `@primevue/forms` Form component

The `@primevue/forms` package is included in `package.json` but the generated `Login.vue` and `Register.vue` don't use the `<Form>` component from it. The autoPage form templates DO use `<Form>`, creating inconsistency.

---

#### Issue 16: No `src/pages/` alias works in SSR but may confuse developers

In SSR mode, `pages/login.vue` imports `src/pages/Login.vue`:
```vue
<script setup lang="ts">
import LoginPage from '@src/pages/Login.vue'
</script>
```

The `@src` alias maps to `~/src` (configured in `nuxt.config.ts`). This creates a two-layer page system that's confusing: Nuxt `pages/` files are thin wrappers around components in `src/pages/`. Developers may not realize they need to edit `src/pages/` to change page content.

---

#### Issue 17: CRUD composable (`composables/crud.ts`) is not used by `autoPage` templates

There are two separate data-fetching strategies in the generated app:
1. `composables/crud.ts` — typed, validates input with Valibot, handles auth headers (used in tests)
2. Raw `fetch('/api/todo')` calls — used in `autoPage` templates

These are completely disconnected. `autoPage` pages bypass the composable entirely. This means:
- Input validation is not applied client-side for autoPage forms
- Auth headers are not included (important for SSR)
- The typed TypeScript interfaces are not used

**Fix**: `autoPage` templates should import and use the typed CRUD composable from `composables/crud.ts`.

---

#### Issue 18: `vasp start` in generated `package.json` requires global `vasp` install

The generated `package.json` has:
```json
"scripts": {
  "dev": "vasp start",
  "build": "vasp build"
}
```

But `vasp` must be globally installed for this to work. If `vasp` is not global (e.g., used via `bunx` or in a monorepo), `bun run dev` fails with `command not found: vasp`.

**Fix**: Either:
- Use `bunx vasp-cli start` instead of `vasp start`
- Or include `vasp-cli` as a `devDependency` in the generated `package.json` so it can be run as `bunx vasp start`

---

## Summary Table

| # | Severity | Category | Description |
|---|----------|----------|-------------|
| 1 | 🔴 Critical | Bug | `autoPage` uses `/api/<entity>` but CRUD is at `/api/crud/<entity>` |
| 2 | 🔴 Critical | Bug | `autoPage` list "New/Edit" buttons navigate to non-existent pages |
| 3 | 🔴 Critical | Bug | Explicit FK column + relation field generates duplicate schema columns |
| 4 | 🔴 Critical | Bug | CRUD list route ignores `filterable`/`search` config — no WHERE clauses |
| 5 | 🟠 Major | UX | Page components are empty placeholders — no functional UI |
| 6 | 🟠 Major | UX | Login/Register use raw HTML, not PrimeVue components |
| 7 | 🟠 Major | UX | No navigation bar, sidebar, or layout generated |
| 8 | 🟠 Major | UX | Dark mode configured but no toggle button generated |
| 9 | 🟠 Major | Feature | Realtime block generates no frontend WebSocket client code |
| 10 | 🟡 Moderate | DX | `admin` block rejects names with a confusing error message |
| 11 | 🟡 Moderate | DX | `--starter` flag silently ignored when using space syntax |
| 12 | 🟡 Moderate | DX | All routes auth-protected by default; `protected: false` undiscoverable |
| 13 | 🟡 Moderate | Bug | Incremental generation deletes files it claims to have preserved |
| 14 | 🔵 Minor | DX | No first-user seeding — can't log in after fresh install |
| 15 | 🔵 Minor | Consistency | Auth forms don't use `@primevue/forms` despite it being in package.json |
| 16 | 🔵 Minor | DX | Two-layer page system (`pages/` wrapper + `src/pages/` component) is confusing |
| 17 | 🔵 Minor | Consistency | `autoPage` uses raw `fetch()` instead of typed CRUD composable |
| 18 | 🔵 Minor | DX | `vasp start` in package.json requires global `vasp` install |

---

## What "One-Shot" Would Look Like

For Vasp to truly generate a complete, working, beautiful app from a single `main.vasp` file, the following must be true:

### Minimal Working App (0 manual edits after generation)

1. **`autoPage` must use the correct API path** (`/api/crud/<entity>`)
2. **`autoPage` list + form + detail must be auto-linked** — the list's "New" button must know where the create page lives
3. **Schema generation must be idempotent** — declaring a relation field shouldn't create duplicate columns
4. **A default layout with navigation** must be generated automatically
5. **Auth pages must use the configured UI library** (PrimeVue)
6. **A first-user seed** must exist so you can immediately log in

### Beautiful App (currently requires manual work)

7. **Page components must scaffold actual UI** — a `page` tied to a `crud` entity should render a working DataTable with pagination
8. **Dark mode toggle** in the default layout
9. **Realtime frontend composable** generated from the `realtime` block

### One-Shot DSL Ideal

The ideal flow:
```vasp
app MyTodo {
  title: "My Todo App"
  ssr: true
  typescript: true
  ui: { theme: Lara, primaryColor: blue }
}

auth User { ... }

entity Todo { ... }

crud Todo {
  entity: Todo
  operations: [list, create, update, delete]
}

// This one block should generate:
// - A working list page at /todos with DataTable, pagination, search, filters
// - A working create form at /todos/create
// - A working edit form at /todos/:id/edit
// - A working detail page at /todos/:id
// - All wired to /api/crud/todo with auth
// - Navigation link in the default layout
// - Dark mode toggle
// - No manual edits required
autoPage TodoPages {
  entity: Todo
  path: "/todos"
  type: list+form+detail  // ← generate all three at once
}
```

That's the goal. Currently, it takes ~200 lines of manual Vue code after generation to get even a basic working page.

---

## Files in This Directory

- `main.vasp` — The vasp file we wrote for the beautiful todo app (with inline issue comments)
- `ISSUES.md` — This file

The actual generated output was explored in `/tmp/vasp-todo-exploration/` during the session.
