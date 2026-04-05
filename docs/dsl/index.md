# `.vasp` DSL Overview

`main.vasp` is the single source of truth for your full stack.

## Example

```vasp
app MyTodoApp {
  title: "Vasp Todo"
  db: Drizzle
  ssr: false
  typescript: true
}

entity Todo {
  id: Int @id
  title: String
  done: Boolean
  createdAt: DateTime @default(now)
}

crud Todo {
  entity: Todo
  operations: [list, create, update, delete]
}
```

## Block families

- App-level: `app`, `auth`, `admin`, `seed`, `cache`, `observability`, `webhook`
- Data model: `entity`
- UI/routing: `route`, `page`, `autoPage`
- Data access: `query`, `action`, `crud`, `api`
- Runtime concerns: `realtime`, `job`, `storage`, `email`, `middleware`

## Validation model

Vasp validates both syntax and semantics (invalid references, duplicates, unsupported values, and dependency constraints like realtime requiring CRUD).

::: tip
Use `vasp validate --strict` in CI for faster feedback before generation.
:::
