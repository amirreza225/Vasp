# Create Your First Project

## Generate a new app

```bash
vasp new my-app
```

You can also skip prompts with flags:

```bash
vasp new my-app --typescript --ssr
vasp new my-app --starter=todo
```

## Start development

```bash
cd my-app
vasp start
```

By default, Vasp will:
- Ensure dependencies are installed
- Generate/update code from `main.vasp`
- Start backend and frontend dev servers

## Minimal `main.vasp`

```vasp
app MyApp {
  title: "My App"
  db: Drizzle
  ssr: false
  typescript: true
}

entity Todo {
  id: Int @id
  title: String
  done: Boolean
}

crud Todo {
  entity: Todo
  operations: [list, create, update, delete]
}
```

::: warning
Treat generated files as framework-managed unless they are intended extension points. Keep your business logic in `src/` imports referenced from DSL blocks.
:::
