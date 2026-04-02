# `app` Block

The `app` block is required and defines global project behavior.

```vasp
app MyApp {
  title: "My App"
  db: Drizzle
  ssr: false
  typescript: true
  env: {
    DATABASE_URL: required String
    JWT_SECRET: required String @minLength(32)
    PORT: optional Int @default(3001)
  }
}
```

## Key options

| Field | Description |
|---|---|
| `title` | Project title |
| `db` | Database engine (currently Drizzle) |
| `ssr` | `false`, `true`, or `"ssg"` |
| `typescript` | `true` or `false` |
| `env` | Typed environment variable declarations |
| `multiTenant` | Tenant strategy configuration |
| `ui` | PrimeVue theme settings |

## Multi-tenancy

```vasp
multiTenant: {
  strategy: row-level
  tenantEntity: Workspace
  tenantField: workspaceId
}
```

## UI theme config

```vasp
ui: {
  theme: Aura
  primaryColor: emerald
  darkModeSelector: ".app-dark"
  ripple: true
}
```
