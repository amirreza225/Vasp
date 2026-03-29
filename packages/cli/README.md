# vasp-cli

The official CLI for [Vasp](https://github.com/vasp-framework/vasp) — a declarative full-stack framework for Vue developers powered by Bun + Elysia.

**Version: 1.5.0**

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

Scaffold a new Vasp project. When run without flags in an interactive terminal, Vasp shows a one-pass prompt sequence to guide you through template selection, TypeScript, and SSR — just like Astro, Nuxt, and create-vue.

```bash
vasp new my-app                       # Interactive prompts (TTY)
vasp new my-app --typescript          # TypeScript, skip prompts
vasp new my-app --ssr                 # SSR via Nuxt 4, skip prompts
vasp new my-app --ssg                 # Static Site Generation via Nuxt 4
vasp new my-app --ssr --typescript    # SSR + TypeScript
vasp new my-app --starter=todo        # Use a starter template, skip prompts
vasp new my-app --no-install          # Skip bun install
```

**Interactive prompt flow (no flags):**
```
Which template would you like to use?
  1) None — blank project (just a home page)
  2) minimal — bare-bones app
  3) todo — Todo list with CRUD
  4) recipe — Recipe app with auth
  5) todo-auth-ssr — Todo + Auth + Nuxt SSR

Enable TypeScript? [y/N]:
Enable SSR (Nuxt 4)? [y/N]:
```

**Starters:** `minimal`, `todo`, `todo-auth-ssr`, `recipe`

### `vasp add <type> [name] [options]`

Incrementally add a new block to an existing `main.vasp`. Each sub-command validates for conflicts, appends the DSL block, creates source-file stubs, and automatically reruns generation.

```bash
vasp add entity Post                        # Add an entity with id + createdAt
vasp add page   Dashboard --path=/dashboard # Add route + page + Vue component stub
vasp add crud   Post                        # Add CRUD endpoints for an entity
vasp add query  getPostById                 # Add query block + typed function stub
vasp add action createPost                  # Add action block + typed function stub
vasp add job    sendWelcomeEmail            # Add background job + perform stub
vasp add auth                               # Add auth block (+ User entity if missing)
vasp add api    webhookReceiver --method=POST --path=/api/webhooks
```

### `vasp generate`

Safely regenerate your project from `main.vasp`. Preserves files you've manually edited.

```bash
vasp generate           # Regenerate, keep user-modified files
vasp generate --force   # Overwrite all generated files
vasp generate --dry-run # Preview what would change
```

### `vasp start`

Start the dev servers (backend + frontend) concurrently with color-prefixed output. Automatically pushes the Drizzle schema when it detects changes, and opens your browser to the app URL after the servers are ready.

```bash
cd my-app && vasp start
# → opens http://localhost:5173 (SPA) or http://localhost:3000 (SSR)
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

### `vasp validate`

Parse and semantically validate `main.vasp` without generating any files. Prints structured error messages with line/column information.

```bash
cd my-app && vasp validate
# → ✓ main.vasp is valid  (on success)
# → [E101_UNKNOWN_PAGE_REF] (line 12, col 7): Route "HomeRoute" references undefined page "HomePage"  (on error)
```

## Health Check

Every generated server exposes `GET /api/health` returning `{ status: "ok", version: "..." }`. Deployment targets (Docker, Fly, Railway) use this endpoint for health probes automatically.

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

[Apache 2.0](https://github.com/amirreza225/Vasp/blob/main/LICENSE)
