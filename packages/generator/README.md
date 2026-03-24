# @vasp-framework/generator

Handlebars-based code generator for Vasp. Takes a `VaspAST` and writes a complete, production-ready full-stack project to disk.

This is an internal package used by `vasp-cli`. You don't need to install it unless you're building custom Vasp tooling.

## Usage

```typescript
import { generate } from '@vasp-framework/generator'
import { parse } from '@vasp-framework/parser'

const ast = parse(source)

const result = generate(ast, {
  outputDir: '/path/to/my-app',
  templateDir: '/path/to/templates', // optional, defaults to bundled templates
  logLevel: 'info',                  // 'silent' | 'info' | 'verbose'
})

console.log(result.success)        // true
console.log(result.filesWritten)   // ['package.json', 'server/index.js', ...]
console.log(result.errors)         // [] on success
```

## Generator Pipeline

Generators run in dependency order:

| Generator | Output |
|---|---|
| `ScaffoldGenerator` | `package.json`, `.gitignore`, `.env.example`, `bunfig.toml`, `tsconfig.json` |
| `DrizzleSchemaGenerator` | `drizzle/schema.js\|ts` — entity-aware typed columns when `entity` blocks exist |
| `BackendGenerator` | `server/index.js\|ts`, query/action route stubs |
| `AuthGenerator` | Auth routes, JWT middleware, `Login.vue`, `Register.vue` |
| `QueryActionGenerator` | `server/routes/queries/`, `server/routes/actions/` |
| `CrudGenerator` | `server/routes/crud/` + client CRUD helpers |
| `RealtimeGenerator` | `server/routes/realtime/` + `useRealtime` composable |
| `JobGenerator` | `server/jobs/` (PgBoss workers) + schedule endpoints |
| `FrontendGenerator` | Vue 3 + Vite (SPA) **or** Nuxt 4 (SSR/SSG) frontend |

## Template Trees

Four separate template trees — no unified template with `{{#if isSsr}}` blocks:

```
templates/
├── shared/          # Backend, auth, CRUD, realtime, jobs (mode-agnostic)
├── spa/
│   ├── js/          # Vue 3 + Vite, JavaScript
│   └── ts/          # Vue 3 + Vite, TypeScript
└── ssr/
    ├── js/          # Nuxt 4, JavaScript
    └── ts/          # Nuxt 4, TypeScript
```

## License

[Apache 2.0](../../LICENSE)
