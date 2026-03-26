# Plan: Inline Blocks & Layered Escape-Hatch Model

**Status:** Planned — implement after base framework is stable
**Goal:** Make `.vasp` the single source of truth for an entire app, including UI templates and business logic, so AI can generate one file and `vasp generate` produces a complete full-stack app.

---

## The Problem

Today, pages in Vasp reference external Vue components:

```vasp
page TodoList {
  component: import TodoList from "@src/pages/TodoList.vue"
}
```

This breaks the single-file AI workflow. The AI has to generate multiple files instead of one.

---

## The Solution: Layered Escape-Hatch Model

Every layer is valid `.vasp`. Users (and AI) stay at the lowest layer that covers their needs and escape upward only when necessary.

### Layer 1 — Pure Declaration (already exists)

```vasp
entity Todo {
  id: Int @id
  title: String
  done: Boolean @default(false)
}

crud Todo {
  operations: [list, create, update, delete]
}
```

Zero code. Vasp generates full backend + CRUD frontend automatically.

---

### Layer 2 — Declarative UI (new: `page` layout primitives)

Extend `page` blocks with high-level layout keywords. No templates, no code.

```vasp
page TodoList {
  route: /todos
  layout: list
  entity: Todo
  columns: [title, done, createdAt]
  filters: [done]
  actions: [create, delete]
}

page Dashboard {
  route: /
  layout: grid
  sections: [TodoStats, RecentTodos]
}
```

**Layouts to support (start with these):**
- `list` — paginated table with filters and row actions
- `form` — create/edit form for an entity
- `detail` — read-only detail view of a single record
- `grid` — card grid, used for dashboards
- `blank` — empty page, user supplies everything via Layer 4

**Generator:** `FrontendGenerator` maps layout type → pre-built Vue component template. No custom template parsing needed.

---

### Layer 3 — Inline Logic (new: inline function bodies)

For queries and actions where the declarative form isn't enough. Content between triple backticks is extracted as a raw string — **Vasp never parses it**, just passes it through to the TypeScript/JavaScript compiler.

```vasp
query getActiveTodos {
  entities: [Todo]
  fn: ```
    const todos = await db
      .select()
      .from(Todo)
      .where(eq(Todo.done, false))
      .orderBy(desc(Todo.createdAt))
    return todos
  ```
}

action toggleTodo {
  entities: [Todo]
  auth: true
  fn: ```
    const { id } = input
    const todo = await db.select().from(Todo).where(eq(Todo.id, id)).get()
    await db.update(Todo).set({ done: !todo.done }).where(eq(Todo.id, id))
  ```
}
```

**Generator behavior:** wrap the inline body in the appropriate Elysia handler function signature, exactly as it does today for externally imported `fn:` values — but sourced from the inline block instead of an import.

---

### Layer 4 — Inline Templates (new: inline Vue SFC blocks)

For pages where layout primitives aren't enough. Same pass-through principle — parser extracts raw strings, generator wraps them in a `.vue` SFC file.

```vasp
page CustomDashboard {
  route: /dashboard
  auth: true

  script: ```
    const { data: stats } = useQuery('getStats')
    const { data: todos } = useQuery('getActiveTodos')
    const totalDone = computed(() => todos.value?.filter(t => t.done).length)
  ```

  template: ```
    <div class="grid grid-cols-3 gap-6 p-8">
      <stat-card title="Total" :value="stats?.total" />
      <stat-card title="Done" :value="totalDone" />
    </div>
  ```

  style: ```
    .grid { display: grid; }
  ```
}
```

**Generator behavior:** emit a `.vue` file with the `<template>`, `<script setup>`, and `<style>` sections populated from the inline blocks. If `script` is omitted, emit `<script setup></script>`. If `style` is omitted, skip it.

---

### Pug Support — Free With Pass-Through

Once pass-through exists, Pug costs ~10 lines of generator code:

```vasp
page TodoList {
  route: /todos
  templateLang: pug

  template: ```
    div.container
      h1 My Todos
      ul
        li(v-for="todo in todos" :key="todo.id") {{ todo.title }}
  ```
}
```

Generator emits `<template lang="pug">` instead of `<template>`. Vite handles Pug compilation via `vite-plugin-vue` + `pug` package. Vasp never touches Pug syntax.

**Same pattern works for:** `templateLang: html` (default), any future template language.

---

## Implementation Plan

### Phase 1 — Parser: Triple-Backtick Inline Blocks

**Files to change:**
- `packages/core/src/types/ast.ts` — add `InlineBlock` type, add `inlineScript`/`inlineTemplate`/`inlineStyle`/`inlineFn` fields to relevant nodes
- `packages/parser/src/lexer/TokenType.ts` — add `BACKTICK_BLOCK` token
- `packages/parser/src/lexer/Lexer.ts` — when lexer sees ` ``` `, scan forward until closing ` ``` ` on its own line, emit entire content as a single `BACKTICK_BLOCK` token
- `packages/parser/src/parser/Parser.ts` — accept `BACKTICK_BLOCK` as a value for `fn:`, `template:`, `script:`, `style:` fields
- `packages/parser/src/validator/SemanticValidator.ts` — validate that `template:` / `script:` only appear in `page` blocks; `fn:` inline only in `query`/`action`/`job`

**Key rule:** the lexer owns backtick block extraction. Everything between opening and closing ` ``` ` is one opaque token. The parser never sees the content, only the token.

---

### Phase 2 — Generator: Emit Inline Content

**`QueryActionGenerator`:**
- If `query.fn` is an `InlineBlock`, emit the body directly into the handler function instead of importing it
- Wrap with the same function signature as today's imported handler

**`FrontendGenerator`:**
- If a `page` has `inlineTemplate` / `inlineScript` / `inlineStyle`, generate the `.vue` SFC with those as the section contents
- If `templateLang` is set, add `lang="…"` attribute to `<template>`
- If only `inlineScript` is present (no template), emit a minimal template `<div></div>` and log a warning

**`JobGenerator`:**
- Same pattern as QueryActionGenerator for inline `perform.fn`

---

### Phase 3 — Layer 2 Declarative UI

**New AST fields on `PageNode`:**
```ts
layout?: 'list' | 'form' | 'detail' | 'grid' | 'blank'
entity?: string           // for list/form/detail layouts
columns?: string[]        // for list layout
filters?: string[]        // for list layout
actions?: PageAction[]    // for list layout
sections?: string[]       // for grid layout
```

**`FrontendGenerator`:**
- If `layout` is set and no inline blocks are present, use pre-built layout template from `templates/spa/layouts/` or `templates/ssr/layouts/`
- Layout templates are regular `.hbs` files that receive the page's AST node as data
- Priority: inline blocks > layout > external component import

**New template files to create:**
- `templates/shared/layouts/list.vue.hbs`
- `templates/shared/layouts/form.vue.hbs`
- `templates/shared/layouts/detail.vue.hbs`
- `templates/shared/layouts/grid.vue.hbs`

---

### Phase 4 — `templateLang` + Pug

- Add `templateLang?: string` to `PageNode` in AST
- Generator reads it and adds `lang="…"` to `<template>` tag
- Add `pug` to generated app's `package.json` devDependencies when any page uses `templateLang: pug`
- No Vasp-side Pug parsing ever

---

## Parsing Design: Why Triple Backticks

| Delimiter option | Problem |
|---|---|
| `\| ... \|` | Single `\|` appears in TypeScript (bitwise OR, union types) |
| `<<BLOCK ... BLOCK` | Heredoc — unfamiliar, verbose for AI |
| `<template> ... </template>` | Conflicts with HTML inside template content |
| ` ``` ... ``` ` | Universal (Markdown), AI-native, no conflicts with TS/Vue syntax |

Triple backticks win because:
1. AI models see them constantly in training data (Markdown code blocks)
2. They never appear in TypeScript or Vue template syntax
3. Closing delimiter on its own line makes extraction trivially simple: scan lines until you find a line that is only ` ``` ` (optionally with whitespace)

**Lexer pseudocode:**
```ts
if (this.peek(3) === '```') {
  this.advance(3)
  const lines: string[] = []
  while (!this.isAtEnd()) {
    const line = this.readLine()
    if (line.trim() === '```') break
    lines.push(line)
  }
  return this.makeToken(TokenType.BACKTICK_BLOCK, lines.join('\n'))
}
```

---

## What Changes in Existing Blocks

### `query` / `action` — `fn` field

**Before (only option):**
```vasp
query getTodos {
  fn: import getTodos from "@src/queries/getTodos.js"
}
```

**After (both remain valid):**
```vasp
query getTodos {
  fn: import getTodos from "@src/queries/getTodos.js"  // still works
}

query getActiveTodos {
  fn: ```
    return db.select().from(Todo).where(eq(Todo.done, false))
  ```
}
```

### `page` — component vs inline

**Before (only option):**
```vasp
page Dashboard {
  component: import Dashboard from "@src/pages/Dashboard.vue"
}
```

**After (all three valid):**
```vasp
// Option A: external component (still works)
page Dashboard {
  component: import Dashboard from "@src/pages/Dashboard.vue"
}

// Option B: declarative layout
page Dashboard {
  route: /
  layout: grid
  sections: [TodoStats, RecentActivity]
}

// Option C: inline template
page Dashboard {
  route: /
  script: ```
    const { data } = useQuery('getStats')
  ```
  template: ```
    <div>{{ data }}</div>
  ```
}
```

---

## The AI Workflow This Unlocks

**User prompt to AI:**
> "Build me a todo app with auth, a dashboard showing completion stats, and real-time updates"

**AI generates one `main.vasp` file:**
- Entities → Layer 1
- CRUD → Layer 1
- Auth → existing `auth` block
- Standard list/form pages → Layer 2 (`layout: list`, `layout: form`)
- Dashboard with custom stats → Layer 4 (inline template)
- Complex stats query → Layer 3 (inline fn)

**User runs:**
```bash
vasp generate
```

Full stack app — backend, frontend, DB schema, auth, realtime — generated from one file. No other files written by the AI.

---

## What NOT to Do

- **Do not parse the content of inline blocks** — pass them through as opaque strings. If a user writes invalid TypeScript in an inline `fn:`, the TypeScript compiler in the generated app will catch it, not Vasp.
- **Do not make inline blocks the only option** — external imports must remain valid. Existing apps must not break.
- **Do not add Pug parsing to Vasp** — `templateLang: pug` is enough. Vite handles the rest.
- **Do not implement all layers at once** — Phase 1 (parser) and Phase 2 (inline fn in queries) deliver the most value and are the lowest risk. Phases 3 and 4 build on top.

---

## Open Questions (decide before implementing)

1. **Indentation stripping:** should the generator strip the common leading indentation from inline blocks before emitting? (Yes — prevents weird indentation in generated files)
2. **Script type:** should inline `script` blocks default to `<script setup>` or `<script>`? (Default to `<script setup>` — matches current Vue best practices)
3. **TypeScript in inline fn:** when `typescript: true`, should inline `fn:` blocks be emitted as `.ts`? (Yes — same rule as `ctx.ext` today)
4. **Validation of inline content:** should `vasp generate --dry-run` run `tsc` on inline blocks to catch errors early? (Nice to have, not required for v1)
5. **Starter templates:** should starters like `todo.vasp` be updated to use inline blocks as the canonical example? (Yes, once stable)
