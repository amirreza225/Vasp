# @vasp-framework/core

Shared types, AST node definitions, error classes, and constants for the Vasp framework.

**Version: 1.5.3**

This package is an internal dependency used by `@vasp-framework/parser`, `@vasp-framework/generator`, and `vasp-cli`. You don't need to install it directly unless you're building Vasp tooling.

## Contents

### AST Types

The `VaspAST` interface is the source of truth for what a parsed `.vasp` file looks like:

```typescript
interface VaspAST {
  app?: AppNode
  auth?: AuthNode
  entities: EntityNode[]
  routes: RouteNode[]
  pages: PageNode[]
  queries: QueryNode[]
  actions: ActionNode[]
  apis: ApiNode[]
  middlewares: MiddlewareNode[]
  cruds: CrudNode[]
  realtimes: RealtimeNode[]
  jobs: JobNode[]
  seed?: SeedNode
  admin?: AdminNode
  storages: StorageNode[]
  emails: EmailNode[]
  caches: CacheNode[]
  webhooks: WebhookNode[]
  observability?: ObservabilityNode
  autoPages: AutoPageNode[]
}
```

The `VaspNode` union covers all 20 concrete node types:
`AppNode | AuthNode | EntityNode | RouteNode | PageNode | QueryNode | ActionNode | ApiNode | MiddlewareNode | CrudNode | RealtimeNode | JobNode | SeedNode | AdminNode | StorageNode | EmailNode | CacheNode | WebhookNode | ObservabilityNode | AutoPageNode`

### Entity Types

```typescript
/** All scalar/primitive field types supported by Vasp */
type PrimitiveFieldType =
  | 'String'
  | 'Int'
  | 'Boolean'
  | 'DateTime'
  | 'Float'
  | 'Text'
  | 'Json'
  | 'Enum'    // requires enumValues on FieldNode
  | 'File'    // requires storageBlock on FieldNode

type FieldModifier = 'id' | 'unique' | 'default_now' | 'nullable' | 'updatedAt'

/** DSL-declared validation constraints from @validate(...) */
interface FieldValidation {
  email?: boolean       // @validate(email)
  url?: boolean         // @validate(url)
  uuid?: boolean        // @validate(uuid)
  minLength?: number    // @validate(minLength: n)
  maxLength?: number    // @validate(maxLength: n)
  min?: number          // @validate(min: n)
  max?: number          // @validate(max: n)
}

type OnDeleteBehavior = 'cascade' | 'restrict' | 'set null'

interface FieldNode {
  name: string
  type: string               // primitive type name or related entity name
  modifiers: FieldModifier[]
  isRelation: boolean        // true when type is an entity name
  relatedEntity?: string     // entity name when isRelation=true
  isArray: boolean           // true for Entity[] (one-to-many, no DB column)
  nullable: boolean          // true when @nullable present
  defaultValue?: string      // value from @default(val) or 'now' for @default(now)
  onDelete?: OnDeleteBehavior // from @onDelete(cascade|restrict|setNull)
  isUpdatedAt: boolean       // true when @updatedAt present
  enumValues?: string[]      // variant values when type === 'Enum'
  validation?: FieldValidation // from @validate(...)
  isManyToMany?: boolean     // true when @manyToMany present (implicit junction table)
  storageBlock?: string      // storage block name from @storage(Name) — File fields only
}

interface EntityNode extends BaseNode {
  type: 'Entity'
  fields: FieldNode[]
  indexes?: EntityIndex[]              // table-level @@index declarations
  uniqueConstraints?: EntityUniqueConstraint[] // table-level @@unique declarations
}

interface EntityIndex {
  fields: string[]
  type?: 'fulltext'   // omit for default btree; 'fulltext' generates GIN index
}

interface EntityUniqueConstraint {
  fields: string[]
}
```

### Error Classes

| Class | Description |
|---|---|
| `VaspError` | Base error class |
| `ParseError` | Thrown by the parser with structured diagnostics |
| `GeneratorError` | Thrown by the code generator |

### Plugin Types

Types for the Vasp plugin system — used by `vasp.config.ts` at the project root and accepted by `generate()` in `@vasp-framework/generator`.

```typescript
/**
 * Shape of vasp.config.ts / vasp.config.js at the project root.
 * vasp generate and vasp start load this file automatically.
 */
interface VaspConfig {
  plugins?: VaspPlugin[]
}

/** Top-level plugin — attach to VaspConfig.plugins */
interface VaspPlugin {
  name: string

  /** Custom generators that run after all built-in generators */
  generators?: PluginGenerator[]

  /**
   * Override built-in Handlebars templates.
   * Keys = template path relative to templates/ root (e.g. "shared/server/index.hbs")
   * Values = raw .hbs source strings
   */
  templateOverrides?: Record<string, string>

  /**
   * Custom Handlebars helpers available in all templates.
   * Keys become helper names; values are functions (options hash stripped automatically).
   * Block helpers are not supported via this API.
   */
  helpers?: Record<string, (...args: unknown[]) => unknown>
}

/** A single generator contributed by a VaspPlugin */
interface PluginGenerator {
  name: string
  run(ctx: PluginGeneratorContext, write: PluginWriteFn): void
}

/** Read-only context passed to every plugin generator */
interface PluginGeneratorContext {
  ast: VaspAST        // fully-parsed main.vasp
  projectDir: string  // absolute path to the real project directory
  isTypeScript: boolean
  isSsr: boolean
  isSsg: boolean
  isSpa: boolean
  ext: 'ts' | 'js'
}

/**
 * Write a file relative to the project root.
 * Records the file in the manifest — do not write to disk directly.
 * Path traversal attempts are rejected with an error.
 */
type PluginWriteFn = (relativePath: string, content: string) => void
```

**Example `vasp.config.ts`:**

```typescript
import type { VaspPlugin } from '@vasp-framework/core'

const acmePlugin: VaspPlugin = {
  name: 'acme-plugin',
  generators: [{
    name: 'VersionFile',
    run(ctx, write) {
      write(`src/version.${ctx.ext}`, `export const APP = "${ctx.ast.app?.title}";\n`)
    },
  }],
  templateOverrides: {
    'shared/server/index.hbs': '// custom Elysia entry\n{{appName}}',
  },
  helpers: {
    shout: (str: unknown) => String(str).toUpperCase() + '!!!',
  },
}

export default { plugins: [acmePlugin] }
```

### Constants

```typescript
VASP_VERSION                   // '1.3.0'
DEFAULT_BACKEND_PORT           // 3001
DEFAULT_SPA_PORT               // 5173
DEFAULT_SSR_PORT               // 3000

SUPPORTED_AUTH_METHODS         // ['usernameAndPassword', 'google', 'github']
SUPPORTED_API_METHODS          // ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
SUPPORTED_MIDDLEWARE_SCOPES    // ['global', 'route']
SUPPORTED_CRUD_OPERATIONS      // ['list', 'create', 'update', 'delete']
SUPPORTED_REALTIME_EVENTS      // ['created', 'updated', 'deleted']
SUPPORTED_JOB_EXECUTORS        // ['PgBoss', 'BullMQ', 'RedisStreams', 'RabbitMQ', 'Kafka']

SUPPORTED_FIELD_TYPES          // ['String', 'Int', 'Boolean', 'DateTime', 'Float', 'Text', 'Json', 'Enum', 'File']
SUPPORTED_STORAGE_PROVIDERS    // ['local', 's3', 'r2', 'gcs']
SUPPORTED_EMAIL_PROVIDERS      // ['resend', 'sendgrid', 'smtp']
SUPPORTED_CACHE_PROVIDERS      // ['memory', 'redis', 'valkey']
SUPPORTED_MULTI_TENANT_STRATEGIES // ['row-level', 'schema-level', 'database-level']
```

## License

[Apache 2.0](https://github.com/amirreza225/Vasp/blob/main/LICENSE)
