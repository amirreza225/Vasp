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
  entities: EntityNode[]
  routes: RouteNode[]
  pages: PageNode[]
  queries: QueryNode[]
  actions: ActionNode[]
  apis?: ApiNode[]
  middlewares?: MiddlewareNode[]
  cruds: CrudNode[]
  realtimes: RealtimeNode[]
  jobs: JobNode[]
  seed?: SeedNode
}
```

### Entity Types

```typescript
type PrimitiveFieldType = 'String' | 'Int' | 'Boolean' | 'DateTime' | 'Float' | 'Text' | 'Json'
type FieldModifier = 'id' | 'unique' | 'default_now' | 'nullable' | 'updatedAt'

interface FieldNode {
  name: string
  type: string // primitive type or related entity name
  modifiers: FieldModifier[]
  isRelation: boolean
  relatedEntity?: string
  isArray: boolean
  nullable: boolean
  defaultValue?: string
  onDelete?: 'cascade' | 'restrict' | 'setNull'
  isUpdatedAt: boolean
}

interface EntityNode extends BaseNode {
  type: 'Entity'
  fields: FieldNode[]
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
VASP_VERSION           // '0.9.0'
DEFAULT_BACKEND_PORT   // 3001
DEFAULT_SPA_PORT       // 5173
DEFAULT_SSR_PORT       // 3000
SUPPORTED_AUTH_METHODS // ['usernameAndPassword', 'google', 'github']
SUPPORTED_CRUD_OPERATIONS // ['list', 'create', 'update', 'delete']
SUPPORTED_REALTIME_EVENTS // ['created', 'updated', 'deleted']
SUPPORTED_FIELD_TYPES // ['String', 'Int', 'Boolean', 'DateTime', 'Float', 'Text', 'Json']
```

## License

[Apache 2.0](../../LICENSE)
