# @vasp-framework/core

Shared types, AST node definitions, error classes, and constants for the Vasp framework.

This package is an internal dependency used by `@vasp-framework/parser`, `@vasp-framework/generator`, and `vasp-cli`. You don't need to install it directly unless you're building Vasp tooling.

## Contents

### AST Types

The `VaspAST` interface is the source of truth for what a parsed `.vasp` file looks like:

```typescript
interface VaspAST {
  app: AppNode
  auth?: AuthNode
  routes: RouteNode[]
  pages: PageNode[]
  queries: QueryNode[]
  actions: ActionNode[]
  cruds: CrudNode[]
  realtimes: RealtimeNode[]
  jobs: JobNode[]
}
```

### Error Classes

| Class | Description |
|---|---|
| `VaspError` | Base error class |
| `ParseError` | Thrown by the parser with structured diagnostics |
| `GeneratorError` | Thrown by the code generator |

### Constants

```typescript
VASP_VERSION           // '0.1.0'
DEFAULT_BACKEND_PORT   // 3001
DEFAULT_SPA_PORT       // 5173
DEFAULT_SSR_PORT       // 3000
SUPPORTED_AUTH_METHODS // ['usernameAndPassword', 'google', 'github']
SUPPORTED_CRUD_OPERATIONS // ['list', 'create', 'update', 'delete']
SUPPORTED_REALTIME_EVENTS // ['created', 'updated', 'deleted']
```

## License

[Apache 2.0](../../LICENSE)
