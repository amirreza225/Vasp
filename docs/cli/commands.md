# CLI Commands Reference

## Core commands

| Command | Purpose |
|---|---|
| `vasp new <name>` | Create a new project |
| `vasp generate` | Regenerate from `main.vasp` |
| `vasp validate` | Validate DSL syntax and semantics |
| `vasp start` | Start local development |
| `vasp build` | Build for production |
| `vasp deploy --target=<...>` | Generate deployment config |
| `vasp eject` | Remove framework dependency |

## `vasp add` commands

| Command | Adds |
|---|---|
| `vasp add entity <Name>` | `entity` block |
| `vasp add page <Name>` | `page` + `route` |
| `vasp add crud <Entity>` | CRUD block |
| `vasp add query <name>` | Query block + stub |
| `vasp add action <name>` | Action block + stub |
| `vasp add job <name>` | Job block + stub |
| `vasp add auth` | Auth block (and User entity if needed) |
| `vasp add api <name>` | API block + handler stub |

## Database commands

| Command | Purpose |
|---|---|
| `vasp db push` | Push schema |
| `vasp db generate` | Generate migration |
| `vasp db migrate` | Run migrations |
| `vasp db studio` | Open Drizzle Studio |
| `vasp db seed` | Run seed function |

## Migration helpers

```bash
vasp migrate         # v1 to v2 DSL upgrade
vasp migrate-to-ts   # JS to TypeScript migration
vasp enable-ssr      # Upgrade SPA app to SSR/SSG
```
