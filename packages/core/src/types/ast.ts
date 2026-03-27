// ============================================================
// Vasp AST Types — source of truth for the entire framework
// Every package (parser, generator, CLI) imports from here.
// ============================================================

// ------ Location ------

export interface SourceLocation {
  line: number;
  col: number;
  offset: number;
  file?: string;
}

// ------ Import Expressions ------

export type EnvRequirement = "required" | "optional";

export type EnvVarType = "String" | "Int" | "Boolean" | "Enum";

export interface EnvVarValidation {
  minLength?: number;
  maxLength?: number;
  startsWith?: string;
  endsWith?: string;
  min?: number;
  max?: number;
}

export interface EnvVarDefinition {
  requirement: EnvRequirement;
  type: EnvVarType;
  enumValues?: string[];
  defaultValue?: string;
  validation?: EnvVarValidation;
}

export interface DefaultImportExpression {
  kind: "default";
  defaultExport: string; // e.g. "Home" from `import Home from "@src/pages/Home.vue"`
  source: string; // e.g. "@src/pages/Home.vue"
}

export interface NamedImportExpression {
  kind: "named";
  namedExport: string; // e.g. "getTodos" from `import { getTodos } from "@src/queries.js"`
  source: string; // e.g. "@src/queries.js"
}

export type ImportExpression = DefaultImportExpression | NamedImportExpression;

// ------ Auth ------

export type AuthMethod = "usernameAndPassword" | "google" | "github";

/**
 * Maps a permission name (e.g. "task:create") to the list of roles that hold it.
 * Defined inside the `auth` block's `permissions` property.
 */
export type PermissionMap = Record<string, string[]>;

/**
 * Maps a CRUD operation name (e.g. "list", "create") to the permission name required
 * to perform it (e.g. "task:read", "task:create").
 * Defined inside a `crud` block's `permissions` property.
 */
export type CrudPermissions = Record<string, string>;

// ------ CRUD ------

export type CrudOperation = "list" | "create" | "update" | "delete";

export interface CrudListConfig {
  paginate: boolean;
  sortable: string[];
  filterable: string[];
  search: string[];
}

// ------ Realtime ------

export type RealtimeEvent = "created" | "updated" | "deleted";

// ------ Entity / Schema ------

/** Scalar/primitive field types supported by Vasp */
export type PrimitiveFieldType =
  | "String"
  | "Int"
  | "Boolean"
  | "DateTime"
  | "Float"
  | "Text"
  | "Json"
  | "Enum"
  | "File";

/** Kept for backward compatibility — alias for PrimitiveFieldType */
export type FieldType = PrimitiveFieldType;

export type FieldModifier =
  | "id"
  | "unique"
  | "default_now"
  | "nullable"
  | "updatedAt";

/**
 * DSL-declared validation constraints for a field, expressed via @validate(...).
 * These are used to generate Valibot schemas with precise runtime checks.
 *
 * String / Text fields:
 *   email — enforce RFC 5321 email format
 *   url   — enforce URL format
 *   uuid  — enforce UUID v4 format
 *   minLength — minimum character count
 *   maxLength — maximum character count
 *
 * Int / Float fields:
 *   min — minimum numeric value (inclusive)
 *   max — maximum numeric value (inclusive)
 */
export interface FieldValidation {
  email?: boolean;
  url?: boolean;
  uuid?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
}

export type OnDeleteBehavior = "cascade" | "restrict" | "set null";

export interface FieldNode {
  name: string;
  /** Primitive type name (e.g. 'String') or entity name for relations (e.g. 'User') */
  type: string;
  modifiers: FieldModifier[];
  /** True when `type` is an entity name, not a primitive */
  isRelation: boolean;
  /** Entity name when isRelation=true */
  relatedEntity?: string;
  /** True for Recipe[] — virtual one-to-many side, no DB column emitted */
  isArray: boolean;
  /** True when @nullable modifier is present (column allows NULL) */
  nullable: boolean;
  /** Value from @default("val") or @default(now) → 'now' */
  defaultValue?: string;
  /** Cascade behavior from @onDelete(cascade|restrict|setNull) */
  onDelete?: OnDeleteBehavior;
  /** True when @updatedAt modifier is present */
  isUpdatedAt: boolean;
  /** Enum variant values when type === 'Enum', e.g. ['active', 'inactive', 'archived'] */
  enumValues?: string[];
  /** DSL-declared validation constraints from @validate(...) */
  validation?: FieldValidation;
  /** True when @manyToMany modifier is present — Vasp generates an implicit junction table */
  isManyToMany?: boolean;
  /** Storage block name from @storage(StorageName) modifier — only for File fields */
  storageBlock?: string;
}

// ------ Storage ------

export type StorageProvider = "local" | "s3" | "r2" | "gcs";

export interface StorageNode extends BaseNode {
  type: "Storage";
  provider: StorageProvider;
  bucket?: string;
  maxSize?: string;
  allowedTypes?: string[];
  publicPath?: string;
}

// ------ Email ------

export type EmailProvider = "resend" | "sendgrid" | "smtp";

export interface EmailTemplateEntry {
  name: string;
  fn: ImportExpression;
}

export interface ActionOnSuccess {
  sendEmail?: string; // template name (e.g. "welcome")
}

// ------ Cache ------

export type CacheProvider = "memory" | "redis" | "valkey";

export interface CacheRedisConfig {
  /** Env var name that holds the Redis/Valkey connection URL, e.g. "REDIS_URL" */
  url: string;
}

export interface QueryCacheConfig {
  /** Name of the declared cache block to use as the backing store */
  store: string;
  /** TTL override in seconds for this specific query (overrides the store default) */
  ttl?: number;
  /** Static cache key string (e.g. "public-posts") */
  key?: string;
  /** CRUD entity:operation pairs that should invalidate this cache entry (e.g. "Post:create") */
  invalidateOn?: string[];
}

// ------ Job Executors ------

export type JobExecutor = "PgBoss";

// ------ API ------

export type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

// ------ Middleware ------

export type MiddlewareScope = "global" | "route";

// ------ Multi-Tenancy ------

export type MultiTenantStrategy =
  | "row-level"
  | "schema-level"
  | "database-level";

export interface MultiTenantConfig {
  strategy: MultiTenantStrategy;
  /** Name of the entity that represents a tenant (e.g. "Workspace") */
  tenantEntity: string;
  /** Field name on every entity that holds the tenant FK (e.g. "workspaceId") */
  tenantField: string;
}

// ------ Base Node ------

export interface BaseNode {
  name: string;
  loc: SourceLocation;
}

// ------ Concrete AST Nodes ------

export interface AppNode extends BaseNode {
  type: "App";
  title: string;
  db: "Drizzle";
  ssr: boolean | "ssg"; // false = SPA (default), true = SSR, 'ssg' = Static Site Generation
  typescript: boolean;
  env?: Record<string, EnvVarDefinition>;
  multiTenant?: MultiTenantConfig;
}

export interface AuthNode extends BaseNode {
  type: "Auth";
  userEntity: string; // name of the entity used for users (e.g. "User")
  methods: AuthMethod[];
  roles?: string[];
  /** Granular permission map: permName → roles that hold it */
  permissions?: PermissionMap;
}

export interface RouteNode extends BaseNode {
  type: "Route";
  path: string; // URL path, e.g. "/"
  to: string; // name of the target PageNode
  params: string[]; // extracted route params, e.g. [":id"] → ["id"]
}

export interface PageNode extends BaseNode {
  type: "Page";
  component: ImportExpression;
}

export interface QueryNode extends BaseNode {
  type: "Query";
  fn: ImportExpression;
  entities: string[]; // entity names this query accesses
  auth: boolean; // true = requires authentication
  roles?: string[];
  /** Optional cache configuration for this query */
  cache?: QueryCacheConfig;
}

export interface ActionNode extends BaseNode {
  type: "Action";
  fn: ImportExpression;
  entities: string[];
  auth: boolean;
  roles?: string[];
  onSuccess?: ActionOnSuccess;
}

export interface EmailNode extends BaseNode {
  type: "Email";
  provider: EmailProvider;
  from: string;
  templates: EmailTemplateEntry[];
}

export interface CrudNode extends BaseNode {
  type: "Crud";
  entity: string;
  operations: CrudOperation[];
  listConfig?: CrudListConfig;
  /** Per-operation permission requirements: operation → permission name */
  permissions?: CrudPermissions;
}

export interface RealtimeNode extends BaseNode {
  type: "Realtime";
  entity: string;
  events: RealtimeEvent[];
}

export interface JobPerform {
  fn: ImportExpression;
}

export interface JobNode extends BaseNode {
  type: "Job";
  executor: JobExecutor;
  perform: JobPerform;
  schedule?: string; // optional cron expression
}

export interface SeedNode {
  type: "Seed";
  fn: ImportExpression;
  loc: SourceLocation;
}

export interface ApiNode extends BaseNode {
  type: "Api";
  method: ApiMethod;
  path: string;
  fn: ImportExpression;
  auth: boolean;
  roles?: string[];
}

export interface MiddlewareNode extends BaseNode {
  type: "Middleware";
  fn: ImportExpression;
  scope: MiddlewareScope;
}

/** Index type for @@index — omit for default btree, use "fulltext" for GIN-based full-text search */
export type EntityIndexType = "fulltext";

/** A table-level index declared with @@index([fields]) or @@index([fields], type: fulltext) */
export interface EntityIndex {
  fields: string[];
  type?: EntityIndexType;
}

/** A table-level composite unique constraint declared with @@unique([fields]) */
export interface EntityUniqueConstraint {
  fields: string[];
}

export interface EntityNode extends BaseNode {
  type: "Entity";
  fields: FieldNode[];
  /** Table-level indexes (compound and/or full-text) declared with @@index */
  indexes?: EntityIndex[];
  /** Table-level composite unique constraints declared with @@unique */
  uniqueConstraints?: EntityUniqueConstraint[];
}

export interface AdminNode {
  type: "Admin";
  /** Entity names to expose in the admin panel */
  entities: string[];
  loc: SourceLocation;
}

export interface CacheNode extends BaseNode {
  type: "Cache";
  provider: CacheProvider;
  /** Default TTL in seconds for all queries using this store (default: 60) */
  ttl?: number;
  /** Connection config — only used when provider is "redis" or "valkey" */
  redis?: CacheRedisConfig;
}

// ------ Top-level AST ------

export interface VaspAST {
  app: AppNode;
  auth?: AuthNode;
  entities: EntityNode[];
  routes: RouteNode[];
  pages: PageNode[];
  queries: QueryNode[];
  actions: ActionNode[];
  apis?: ApiNode[];
  middlewares?: MiddlewareNode[];
  cruds: CrudNode[];
  realtimes: RealtimeNode[];
  jobs: JobNode[];
  seed?: SeedNode;
  admin?: AdminNode;
  storages?: StorageNode[];
  emails?: EmailNode[];
  caches?: CacheNode[];
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
  | ApiNode
  | MiddlewareNode
  | CrudNode
  | RealtimeNode
  | JobNode
  | SeedNode
  | AdminNode
  | StorageNode
  | EmailNode
  | CacheNode;

export type NodeType = VaspNode["type"];
