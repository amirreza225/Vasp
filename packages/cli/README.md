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

**Starters:** `minimal`, `todo`, `todo-auth-ssr`, `recipe`

### `vasp generate`

Safely regenerate your project from `main.vasp`. Preserves files you've manually edited.

```bash
vasp generate           # Regenerate, keep user-modified files
vasp generate --force   # Overwrite all generated files
vasp generate --dry-run # Preview what would change
```

### `vasp start`

Start the dev servers (backend + frontend) concurrently with color-prefixed output. Automatically pushes the Drizzle schema when it detects changes.

```bash
cd my-app && vasp start
```

### `vasp build`

Build for production — compiles the Elysia backend with Bun and the frontend with Vite or Nuxt.

```bash
cd my-app && vasp build
```

### `vasp db`

Run Drizzle database commands.

```bash
vasp db push        # Push schema changes to the database
vasp db generate    # Generate a SQL migration file
vasp db migrate     # Run pending migrations
vasp db studio      # Open Drizzle Studio GUI
vasp db seed        # Seed the database
```

### `vasp deploy`

Generate deployment configuration files for your target platform. Vasp generates the files — you deploy using the platform's CLI.

```bash
vasp deploy --target=docker    # Dockerfile + docker-compose.yml + .dockerignore
vasp deploy --target=fly       # fly.toml + Dockerfile
vasp deploy --target=railway   # railway.json + Dockerfile
vasp deploy --target=docker --force  # Overwrite existing files
```

**Docker example:**
```bash
vasp deploy --target=docker
docker-compose up --build
```

**Fly.io example:**
```bash
vasp deploy --target=fly
fly secrets set DATABASE_URL=<your-postgres-url>
fly deploy
```

### `vasp eject`

Remove the `@vasp-framework/runtime` dependency and inline all composables into your project. The result is a standard Vue/Nuxt + Elysia app with no Vasp dependency.

```bash
vasp eject            # Preview what will happen
vasp eject --confirm  # Proceed with eject
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
