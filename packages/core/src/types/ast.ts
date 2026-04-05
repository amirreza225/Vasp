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

export interface CrudColumnConfig {
  label?: string;
  width?: string;
  sortable?: boolean;
  filterable?: boolean;
  hidden?: boolean;
}

export interface CrudListConfig {
  paginate: boolean;
  sortable: string[];
  filterable: string[];
  search: string[];
  /** Per-column display configuration declared in `columns {}` sub-block */
  columns?: Record<string, CrudColumnConfig>;
}

export interface CrudFormSection {
  label?: string;
  fields: string[];
}

export type CrudFormLayout = "1-column" | "2-column" | "tabs" | "steps";

export interface CrudFormConfig {
  layout?: CrudFormLayout;
  /** Named sections for single-page forms (`form { layout: "2-column" }`) */
  sections?: Record<string, CrudFormSection>;
  /** Named steps for wizard-style forms (`form { layout: "steps" }`) */
  steps?: Record<string, CrudFormSection>;
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
  | "File"
  | "RichText";

/** Kept for backward compatibility — alias for PrimitiveFieldType */
export type FieldType = PrimitiveFieldType;

export type FieldModifier =
  | "id"
  | "unique"
  | "default_now"
  | "nullable"
  | "updatedAt"
  | "hidden";

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

/**
 * Validation constraints declared in a field's nested `validate {}` config block.
 * This is distinct from `FieldValidation` (used by the `@validate(…)` modifier).
 * The config block form allows declaring `required` and a custom validator import.
 */
export interface FieldValidateConfig {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  /** Regex pattern string the value must match */
  pattern?: string;
  /** Import path to a custom async validator function */
  custom?: string;
}

/**
 * Field-level display hints declared inside a field's `{ … }` config block.
 * These are used by generated UI components (AutoPage, CRUD forms, admin panel)
 * to populate labels, placeholders, and Valibot validation rules.
 *
 * @example
 * ```vasp
 * title: String {
 *   label:       "Task Title"
 *   placeholder: "Enter a task name…"
 *   validate { required: true, minLength: 3, maxLength: 120 }
 * }
 * ```
 */
export interface EntityFieldConfig {
  label?: string;
  placeholder?: string;
  description?: string;
  /** Inline default override (alternative to the `@default(…)` modifier) */
  default?: string | number | boolean;
  validate?: FieldValidateConfig;
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
  /** True when @hidden modifier is present — field is excluded from all API responses */
  isHidden?: boolean;
  /**
   * Field-level display hints declared inside the field's `{ … }` config block.
   * Present only when the field has an explicit config block in the v2 DSL.
   */
  config?: EntityFieldConfig;
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

// ------ Webhook ------

export type WebhookMode = "inbound" | "outbound";

/**
 * Signature verification strategy for inbound webhooks.
 *   stripe-signature — Stripe's Svix/HMAC header verification
 *   github-signature — GitHub's HMAC-SHA256 X-Hub-Signature-256 verification
 *   hmac             — Generic HMAC-SHA256 verification (X-Webhook-Signature header)
 */
export type WebhookVerification =
  | "stripe-signature"
  | "github-signature"
  | "hmac";

export interface WebhookNode extends BaseNode {
  type: "Webhook";
  mode: WebhookMode;
  /** Env var name holding the webhook signing secret (used by both inbound and outbound) */
  secret?: string;
  // ── Inbound-only ──────────────────────────────────────────────────────────
  /** URL path where inbound webhook events are received (e.g. "/webhooks/stripe") */
  path?: string;
  /** User-supplied handler function (named or default import) */
  fn?: ImportExpression;
  /** Signature verification strategy for inbound webhooks */
  verifyWith?: WebhookVerification;
  // ── Outbound-only ─────────────────────────────────────────────────────────
  /** Entity whose CRUD events trigger outbound dispatches */
  entity?: string;
  /** CRUD events that trigger dispatch: created | updated | deleted */
  events?: string[];
  /** Env var name holding comma-separated target URLs */
  targets?: string;
  /** Number of times to retry a failed dispatch (default: 0) */
  retry?: number;
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

export type JobExecutor =
  | "PgBoss"
  | "BullMQ"
  | "RedisStreams"
  | "RabbitMQ"
  | "Kafka";

export type JobBackoffStrategy = "fixed" | "exponential";

export interface JobRetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  limit?: number;
  /** Backoff strategy: "fixed" keeps the same delay, "exponential" multiplies it each attempt */
  backoff?: JobBackoffStrategy;
  /** Initial delay in milliseconds between retries (default: 1000) */
  delay?: number;
  /** Multiplier applied to delay on each attempt when backoff is "exponential" (default: 2) */
  multiplier?: number;
}

export interface JobDeadLetterConfig {
  /** Name of the dead-letter queue/topic/stream to route permanently failed jobs to.
   *  Defaults to "{jobName}-failed" when omitted. */
  queue?: string;
}

// ------ API ------

export type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

// ------ Middleware ------

export type MiddlewareScope = "global" | "route";

// ------ Observability ------

export type ObservabilityExporter = "otlp" | "prometheus" | "console";
export type ErrorTrackingProvider = "sentry" | "datadog" | "none";
export type ObservabilityLogsMode = "structured" | "console";

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

// ------ UI Theming ------

export type UITheme = "Aura" | "Lara" | "Nora" | "Material";
export type UIPrimaryColor =
  | "emerald"
  | "green"
  | "lime"
  | "red"
  | "orange"
  | "amber"
  | "yellow"
  | "teal"
  | "cyan"
  | "sky"
  | "blue"
  | "indigo"
  | "violet"
  | "purple"
  | "fuchsia"
  | "pink"
  | "rose";

export interface AppUIConfig {
  /** PrimeVue theme preset. Default: "Aura" */
  theme: UITheme;
  /** Override the primary color palette. Leave unset to use the preset default. */
  primaryColor?: UIPrimaryColor;
  /**
   * Dark-mode CSS selector applied to the <html> element.
   * Use "system" to follow the OS preference (prefers-color-scheme).
   * Default: ".app-dark"
   */
  darkModeSelector: string;
  /** Enable the ink ripple effect on interactive elements. Default: true */
  ripple: boolean;
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
  ui?: AppUIConfig;
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
  /** Whether this route requires authentication. Defaults to true when an auth block exists. */
  protected?: boolean;
  /** Required roles to access this route (guards + nav visibility). */
  roles?: string[];
  /** Custom nav label (defaults to path-derived label). */
  navLabel?: string;
  /** When true, the route is not shown in the generated navigation bar. */
  hideFromNav?: boolean;
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
  /** Form layout and section/step configuration declared in `form {}` sub-block */
  formConfig?: CrudFormConfig;
  /** Per-operation permission requirements: operation → permission name */
  permissions?: CrudPermissions;
  /**
   * Entity field that stores the owner's user ID for resource-level access
   * control (IDOR prevention). When set, read/update/delete operations
   * automatically append `WHERE <ownershipField> = currentUser.id`, and list
   * filters the results to records owned by the current user.
   * Requires an `auth` block to be defined.
   *
   * @example
   *   ownership: ownerId  // WHERE id = :id AND ownerId = :currentUserId
   */
  ownership?: string;
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
  /** Job priority — higher value = higher priority (default: 1) */
  priority?: number;
  /** Retry configuration with optional exponential backoff */
  retries?: JobRetryConfig;
  /** Dead-letter queue routing for jobs that exhaust all retries */
  deadLetter?: JobDeadLetterConfig;
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

export interface ObservabilityNode {
  type: "Observability";
  /** Enable distributed tracing via OpenTelemetry (default: false) */
  tracing: boolean;
  /** Enable Prometheus/OTLP metrics (default: false) */
  metrics: boolean;
  /** Logging mode: "structured" emits JSON in production, "console" keeps colorful dev output (default: "console") */
  logs: ObservabilityLogsMode;
  /** Trace/metrics exporter backend (default: "console") */
  exporter: ObservabilityExporter;
  /** Error tracking integration (default: "none") */
  errorTracking: ErrorTrackingProvider;
  loc: SourceLocation;
}

// ------ AutoPage ------

/** Page type variants for autoPage */
export type AutoPageType = "list" | "form" | "detail";

/** Row-level action buttons in a list view */
export type AutoPageRowAction = "view" | "edit" | "delete";

/** Top-bar action buttons in a list view */
export type AutoPageTopAction = "create" | "export";

/** Layout presets for form pages */
export type AutoPageLayout = "1-column" | "2-column" | "tabs" | "wizard";

export interface AutoPageNode extends BaseNode {
  type: "AutoPage";
  /** The entity whose data this page displays or edits */
  entity: string;
  /** Vue Router path, e.g. "/todos" or "/todos/:id/edit" */
  path: string;
  pageType: AutoPageType;
  title?: string;
  // ── list-specific ─────────────────────────────────────────
  /** Field names to show as DataTable columns (list) */
  columns?: string[];
  sortable?: string[];
  filterable?: string[];
  searchable?: string[];
  paginate?: boolean;
  pageSize?: number;
  rowActions?: AutoPageRowAction[];
  topActions?: AutoPageTopAction[];
  // ── form/detail-specific ──────────────────────────────────
  /** Field names to show in the form or detail view */
  fields?: string[];
  layout?: AutoPageLayout;
  /** Action name (from `action` block) to call on form submit */
  submitAction?: string;
  /** Route path to navigate to after successful form submit */
  successRoute?: string;
  // ── access control ────────────────────────────────────────
  auth?: boolean;
  roles?: string[];
}

// ------ Top-level AST ------

export interface VaspAST {
  app?: AppNode;
  auth?: AuthNode;
  entities: EntityNode[];
  routes: RouteNode[];
  pages: PageNode[];
  queries: QueryNode[];
  actions: ActionNode[];
  apis: ApiNode[];
  middlewares: MiddlewareNode[];
  cruds: CrudNode[];
  realtimes: RealtimeNode[];
  jobs: JobNode[];
  seed?: SeedNode;
  admin?: AdminNode;
  storages: StorageNode[];
  emails: EmailNode[];
  caches: CacheNode[];
  webhooks: WebhookNode[];
  observability?: ObservabilityNode;
  autoPages: AutoPageNode[];
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
  | CacheNode
  | WebhookNode
  | ObservabilityNode
  | AutoPageNode;

export type NodeType = VaspNode["type"];
