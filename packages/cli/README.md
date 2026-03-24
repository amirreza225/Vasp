# vasp-cli

The official CLI for [Vasp](https://github.com/amirreza-alibeigi/vasp) — a declarative full-stack framework for Vue developers powered by Bun + Elysia.

## Installation

```bash
# Bun (recommended)
bun install -g vasp-cli

# npm
npm install -g vasp-cli
```

> **Requires [Bun](https://bun.sh) ≥ 1.0**

## Usage

```
vasp <command> [options]
```

## Commands

### `vasp new <project-name>`

Scaffold a new Vasp project from your `main.vasp` config.

```bash
vasp new my-app                        # JavaScript + SPA (default)
vasp new my-app --typescript           # TypeScript
vasp new my-app --ssr                  # SSR via Nuxt 4
vasp new my-app --ssg                  # Static Site Generation via Nuxt 4
vasp new my-app --ssr --typescript     # SSR + TypeScript
vasp new my-app --no-install           # Skip bun install
```

**Options:**

| Flag | Alias | Description |
|---|---|---|
| `--typescript` | `--ts` | Enable TypeScript (default: JavaScript) |
| `--ssr` | | Enable SSR mode via Nuxt 4 (default: SPA) |
| `--ssg` | | Enable Static Site Generation via Nuxt 4 |
| `--no-install` | | Skip running `bun install` after scaffolding |

### `vasp migrate-to-ts`

Migrate an existing JavaScript Vasp project to TypeScript in place.

```bash
cd my-app
vasp migrate-to-ts
```

- Sets `typescript: true` in `main.vasp`
- Renames `.js` → `.ts` in `src/` and `server/`
- Regenerates TypeScript scaffold files

### `vasp enable-ssr`

Enable SSR on an existing SPA project.

```bash
cd my-app
vasp enable-ssr
```

- Patches `ssr: false` → `ssr: true` in `main.vasp`
- Regenerates the project with Nuxt 4 SSR files

### `vasp start` *(coming soon)*

Start the development server.

### `vasp build` *(coming soon)*

Build the project for production.

---

## Example `main.vasp`

```vasp
app MyApp {
  database: postgres
  auth: true
  typescript: false
  ssr: false
}

model User {
  id:        Int     @id @default(autoincrement())
  email:     String  @unique
  createdAt: DateTime @default(now())
}

crud User {
  operations: [create, read, update, delete]
  auth: true
}
```

## Generated Project Structure

```
my-app/
├── main.vasp          # Single source of truth
├── server/
│   ├── index.ts       # Elysia + Bun HTTP server
│   ├── db/            # Drizzle ORM setup
│   └── routes/        # Auto-generated CRUD routes
├── src/               # Vue 3 frontend (SPA) or Nuxt 4 (SSR)
│   ├── components/
│   ├── pages/
│   └── composables/
├── package.json
└── bunfig.toml
```

## License

[Apache 2.0](../../LICENSE)
