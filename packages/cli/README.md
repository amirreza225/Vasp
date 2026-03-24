# vasp-cli

The official CLI for [Vasp](https://github.com/vasp-framework/vasp) — a declarative full-stack framework for Vue developers powered by Bun + Elysia.

## Installation

```bash
# Bun (recommended)
bun install -g vasp-cli

# npm
npm install -g vasp-cli
```

> **Requires [Bun](https://bun.sh) >= 1.0**

## Commands

### `vasp new <project-name>`

Scaffold a new Vasp project.

```bash
vasp new my-app                       # JavaScript + SPA (default)
vasp new my-app --typescript          # TypeScript
vasp new my-app --ssr                 # SSR via Nuxt 4
vasp new my-app --ssg                 # Static Site Generation via Nuxt 4
vasp new my-app --ssr --typescript    # SSR + TypeScript
vasp new my-app --starter=todo        # Use a starter template
vasp new my-app --no-install          # Skip bun install
```

**Starters:** `minimal`, `todo`, `todo-auth-ssr`

### `vasp start`

Start the dev servers (backend + frontend) concurrently with color-prefixed output.

```bash
cd my-app && vasp start
```

### `vasp build`

Build for production — compiles the Elysia backend with Bun and the frontend with Vite or Nuxt.

```bash
cd my-app && vasp build
```

### `vasp migrate-to-ts`

Convert an existing JavaScript Vasp project to TypeScript in-place.

```bash
cd my-app && vasp migrate-to-ts
```

- Sets `typescript: true` in `main.vasp`
- Renames `.js` → `.ts` in `src/` and `server/`
- Regenerates TypeScript scaffold files

### `vasp enable-ssr`

Switch an existing SPA project to SSR (Nuxt 4).

```bash
cd my-app && vasp enable-ssr
```

- Patches `ssr: false` → `ssr: true` in `main.vasp`
- Regenerates the Nuxt 4 frontend files

## Example `main.vasp`

```
app TodoApp {
  title: "Todo App"
  db: Drizzle
  ssr: false
  typescript: true
}

auth UserAuth {
  userEntity: User
  methods: [usernameAndPassword]
}

route HomeRoute {
  path: "/"
  to: HomePage
}

page HomePage {
  component: import Home from "@src/pages/Home.vue"
}

crud Todo {
  entity: Todo
  operations: [list, create, update, delete]
}

query getTodos {
  fn: import { getTodos } from "@src/queries.ts"
  entities: [Todo]
  auth: true
}

action createTodo {
  fn: import { createTodo } from "@src/actions.ts"
  entities: [Todo]
  auth: true
}
```

## License

[Apache 2.0](../../LICENSE)
