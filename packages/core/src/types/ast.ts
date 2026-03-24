// ============================================================
// Vasp AST Types — source of truth for the entire framework
// Every package (parser, generator, CLI) imports from here.
// ============================================================

// ------ Location ------

export interface SourceLocation {
  line: number
  col: number
  offset: number
  file?: string
}

// ------ Import Expressions ------

export interface DefaultImportExpression {
  kind: 'default'
  defaultExport: string   // e.g. "Home" from `import Home from "@src/pages/Home.vue"`
  source: string          // e.g. "@src/pages/Home.vue"
}

export interface NamedImportExpression {
  kind: 'named'
  namedExport: string     // e.g. "getTodos" from `import { getTodos } from "@src/queries.js"`
  source: string          // e.g. "@src/queries.js"
}

export type ImportExpression = DefaultImportExpression | NamedImportExpression

// ------ Auth ------

export type AuthMethod = 'usernameAndPassword' | 'google' | 'github'

// ------ CRUD ------

export type CrudOperation = 'list' | 'create' | 'update' | 'delete'

// ------ Realtime ------

export type RealtimeEvent = 'created' | 'updated' | 'deleted'

// ------ Entity / Schema ------

export type FieldType = 'String' | 'Int' | 'Boolean' | 'DateTime' | 'Float'
export type FieldModifier = 'id' | 'unique' | 'default_now'

export interface FieldNode {
  name: string
  type: FieldType
  modifiers: FieldModifier[]
}

// ------ Job Executors ------

export type JobExecutor = 'PgBoss'

// ------ Base Node ------

export interface BaseNode {
  name: string
  loc: SourceLocation
}

// ------ Concrete AST Nodes ------

export interface AppNode extends BaseNode {
  type: 'App'
  title: string
  db: 'Drizzle'
  ssr: boolean | 'ssg'   // false = SPA (default), true = SSR, 'ssg' = Static Site Generation
  typescript: boolean
}

export interface AuthNode extends BaseNode {
  type: 'Auth'
  userEntity: string     // name of the entity used for users (e.g. "User")
  methods: AuthMethod[]
}

export interface RouteNode extends BaseNode {
  type: 'Route'
  path: string           // URL path, e.g. "/"
  to: string             // name of the target PageNode
}

export interface PageNode extends BaseNode {
  type: 'Page'
  component: ImportExpression
}

export interface QueryNode extends BaseNode {
  type: 'Query'
  fn: ImportExpression
  entities: string[]     // entity names this query accesses
  auth: boolean          // true = requires authentication
}

export interface ActionNode extends BaseNode {
  type: 'Action'
  fn: ImportExpression
  entities: string[]
  auth: boolean
}

export interface CrudNode extends BaseNode {
  type: 'Crud'
  entity: string
  operations: CrudOperation[]
}

export interface RealtimeNode extends BaseNode {
  type: 'Realtime'
  entity: string
  events: RealtimeEvent[]
}

export interface JobPerform {
  fn: ImportExpression
}

export interface JobNode extends BaseNode {
  type: 'Job'
  executor: JobExecutor
  perform: JobPerform
  schedule?: string      // optional cron expression
}

export interface EntityNode extends BaseNode {
  type: 'Entity'
  fields: FieldNode[]
}

// ------ Top-level AST ------

export interface VaspAST {
  app: AppNode
  auth?: AuthNode
  entities: EntityNode[]
  routes: RouteNode[]
  pages: PageNode[]
  queries: QueryNode[]
  actions: ActionNode[]
  cruds: CrudNode[]
  realtimes: RealtimeNode[]
  jobs: JobNode[]
}

// ------ Union of all node types ------

export type VaspNode =
  | AppNode
  | AuthNode
  | EntityNode
  | RouteNode
  | PageNode
  | QueryNode
  | ActionNode
  | CrudNode
  | RealtimeNode
  | JobNode

export type NodeType = VaspNode['type']
