/**
 * Typed extra data interfaces for Handlebars template rendering.
 *
 * Every key that a generator may pass as extra data to `BaseGenerator.render()`
 * is declared here as an optional field on `TemplateExtraData`. Together with
 * `BaseTemplateData` (which covers the fields emitted by `baseData()`), this
 * ensures that:
 *
 *  1. TypeScript's excess-property checking flags unknown keys in object literals
 *     passed to `render()`, catching template-data typos at compile time.
 *  2. All values are typed (no `unknown`) so template authors can rely on the
 *     types when reading a generator.
 *
 * Supporting types (e.g. `DrizzleEntityWithSchema`) are exported so that each
 * generator can reference the same definition when building its data objects.
 */

import type {
  AutoPageNode,
  EntityNode,
  FieldNode,
  ImportExpression,
  MiddlewareScope,
  SourceLocation,
} from "@vasp-framework/core";

// ── Drizzle schema types ─────────────────────────────────────────────────────

/**
 * Common fields present on every scalar field emitted to the Drizzle schema.
 * Generator code builds two shapes: primitive fields (with isEnum/enumFnName)
 * and FK fields (with referencedTable/onDelete).  Only the common subset is
 * typed here — the template-specific extras are accessed dynamically by
 * Handlebars and do not need TypeScript-level declaration in this interface.
 *
 * Note: optional accessor properties are intentionally absent to remain
 * compatible with `exactOptionalPropertyTypes: true` — extra variant-specific
 * properties (referencedTable, isEnum …) are allowed via structural typing
 * and do not need to appear here.
 */
export interface DrizzleScalarField {
  name: string;
  type: string;
  nullable: boolean;
  isUpdatedAt: boolean;
  isForeignKey: boolean;
}

export interface DrizzleManyToOneRelation {
  name: string;
  relatedEntity: string;
  relatedTable: string;
  localField: string;
  onDelete: string;
  isSelfRef: boolean;
  relationName: string | undefined;
}

export interface DrizzleOneToManyRelation {
  fieldName: string;
  relatedEntity: string;
  relatedTable: string;
  isSelfRef: boolean;
  relationName: string | undefined;
}

export interface DrizzleManyToManyRef {
  fieldName: string;
  junctionTableConst: string;
}

export interface DrizzleTableIndex {
  name: string;
  fields: string[];
  isFulltext: boolean;
  fulltextSqlExpr: string | undefined;
}

export interface DrizzleTableUniqueConstraint {
  name: string;
  fields: string[];
}

export interface DrizzleEntityWithSchema {
  name: string;
  scalarFields: DrizzleScalarField[];
  manyToOne: DrizzleManyToOneRelation[];
  oneToMany: DrizzleOneToManyRelation[];
  manyToManyRefs: DrizzleManyToManyRef[];
  hasRelations: boolean;
  tableIndexes: DrizzleTableIndex[];
  tableUniqueConstraints: DrizzleTableUniqueConstraint[];
  hasTableIndexes: boolean;
}

export interface JunctionTable {
  /** Drizzle const name, e.g. "projectsToUsers" */
  tableConst: string;
  /** SQL table name, e.g. "projects_to_users" */
  tableName: string;
  entityA: string;
  entityATable: string;
  entityAIdField: string;
  entityB: string;
  entityBTable: string;
  entityBIdField: string;
}

export interface EnumDeclaration {
  /** Drizzle pgEnum function const name, e.g. "todoStatusEnum" */
  fnName: string;
  /** SQL enum type name (underscore-cased), e.g. "todo_status" */
  dbName: string;
  values: string[];
}

export interface CrudWithFields {
  entity: string;
  operations: string[];
  fields: FieldNode[];
  hasEntity: boolean;
}

// ── Auth template types ──────────────────────────────────────────────────────

export interface PermissionEntry {
  name: string;
  roles: string[];
}

export interface UserFkField {
  fieldName: string;
}

export interface HiddenField {
  name: string;
}

// ── Backend template types ───────────────────────────────────────────────────

/**
 * BackendGenerator maps each MiddlewareNode to this shape, adding `fnSource`
 * (the resolved import path) and `importAlias` (the camelCase Elysia plugin alias).
 */
export interface BackendMiddleware {
  name: string;
  type: "Middleware";
  loc: SourceLocation;
  fn: ImportExpression;
  scope: MiddlewareScope;
  fnSource: string;
  importAlias: string;
}

export interface BackendEnvVar {
  name: string;
  requirement: string;
  type: string;
  enumValues: string[] | null;
  defaultValue: string | null;
  validation: {
    minLength?: number;
    maxLength?: number;
    startsWith?: string;
    endsWith?: string;
    min?: number;
    max?: number;
    pattern?: string;
    custom?: string;
  } | null;
}

// ── CRUD template types ──────────────────────────────────────────────────────

export interface CrudWithRelation {
  name: string;
  relatedEntity: string | undefined;
  relatedTable: string;
}

export interface CrudCacheInvalidation {
  camelStore: string;
  pascalStore: string;
  key: string;
}

export interface CrudCacheImport {
  store: string;
  camelStore: string;
  pascalStore: string;
}

export interface CrudOutboundWebhookDispatcher {
  name: string;
  camelName: string;
  pascalName: string;
  hasCreated: boolean;
  hasUpdated: boolean;
  hasDeleted: boolean;
}

// ── Admin template types ─────────────────────────────────────────────────────

export interface AdminManyToOneRelation {
  name: string;
  fkName: string;
  relatedEntity: string | undefined;
  nullable: boolean;
}

// ── Email template types ─────────────────────────────────────────────────────

export interface EmailTemplateRenderEntry {
  name: string;
  fnSource: string;
  namedExport: string | undefined;
  isDefault: boolean;
}

// ── AutoPage template types ──────────────────────────────────────────────────

export interface AutoPageResolvedColumn {
  key: string;
  label: string;
  columnType: string;
  sortable: boolean;
  filterable: boolean;
  searchable: boolean;
  enumOptions: string[];
}

export interface AutoPageResolvedField {
  key: string;
  label: string;
  primevueComponent: string;
  isRequired: boolean;
  isReadOnly: boolean;
  enumOptions: string[];
  isEnum: boolean;
  isBoolean: boolean;
  isDateTime: boolean;
  isFile: boolean;
  isRichText: boolean;
  isText: boolean;
  isNumber: boolean;
  isManyToMany: boolean;
  /** Related entity name — set for relation/manyToMany fields */
  relatedEntity?: string;
  /** Storage block name — set for File fields */
  storageBlock?: string;
  columnType: string;
  fieldType: string;
}

// ── Combined extra data interface ─────────────────────────────────────────────

/**
 * All optional extra fields that generators may pass to `render()` beyond what
 * `baseData()` already provides. Every field is optional — a specific render
 * call only supplies the subset that the target template consumes.
 */
export interface TemplateExtraData {
  // ── Scaffold ────────────────────────────────────────────────────────────
  vaspVersion?: string;
  /** Port on which the frontend dev server listens (overrides baseData value) */
  frontendPort?: number;
  /** Auth method names from the auth block (e.g. ["usernameAndPassword", "google"]) */
  authMethods?: string[];
  /** Full set of entity AST nodes (used for types.ts / validation.ts scaffolding).
   *  May be annotated with extra flags (e.g. `isExplicitFkDuplicate`) before rendering. */
  entities?: EntityNode[] | Record<string, unknown>[];

  // ── Seed ─────────────────────────────────────────────────────────────────
  /** Import kind: "named" or "default" */
  seedImportKind?: string;
  /** Exported function name for the seed import */
  seedImportName?: string;

  // ── Named item identity ─────────────────────────────────────────────────
  /** Name of the current item (query, action, job, email, cache, realtime…) */
  name?: string;
  /** Name of the entity (CRUD, admin) */
  entity?: string;
  /** Entity operations for CRUD endpoints (["list", "create", "update", "delete"]) */
  operations?: string[];

  // ── Backend ─────────────────────────────────────────────────────────────
  middlewares?: BackendMiddleware[];
  envVars?: BackendEnvVar[];

  // ── Auth ────────────────────────────────────────────────────────────────
  hasPermissions?: boolean;
  permissionEntries?: PermissionEntry[];
  userFkFields?: UserFkField[];
  hasUserFkFields?: boolean;
  hiddenFields?: HiddenField[];
  hasHiddenFields?: boolean;
  passwordFieldName?: string;
  passwordSqlColumnName?: string;
  /** Drizzle table const name for the user entity, e.g. "users" */
  userTableName?: string;

  // ── Drizzle schema ───────────────────────────────────────────────────────
  entitiesWithSchema?: DrizzleEntityWithSchema[];
  crudsWithFields?: CrudWithFields[];
  authUserExtraFields?: DrizzleScalarField[];
  authUserOneToMany?: DrizzleOneToManyRelation[];
  authUserManyToOne?: DrizzleManyToOneRelation[];
  authUserManyToManyRefs?: DrizzleManyToManyRef[];
  authUserHasRelations?: boolean;
  authUserEntityName?: string | null;
  enumDeclarations?: EnumDeclaration[];
  hasEnums?: boolean;
  junctionTables?: JunctionTable[];
  hasAnyIndexes?: boolean;
  hasAnyFulltextIndexes?: boolean;
  hasAnyTables?: boolean;

  // ── Query / Action ───────────────────────────────────────────────────────
  namedExport?: string | undefined;
  fnSource?: string;
  requiresAuth?: boolean;
  hasRoles?: boolean;
  roles?: string[];
  hasCache?: boolean;
  cacheStore?: string;
  camelCacheStore?: string;
  cacheTtl?: number | null;
  cacheKey?: string;
  onSuccessSendEmail?: string | undefined;
  onSuccessTemplateFn?: string | undefined;
  onSuccessTemplateSource?: string | undefined;
  onSuccessMailerFile?: string | undefined;

  // ── API ─────────────────────────────────────────────────────────────────
  method?: string;
  path?: string;

  // ── CRUD ────────────────────────────────────────────────────────────────
  realtimeName?: string;
  hasRelations?: boolean;
  withRelations?: CrudWithRelation[];
  hasListConfig?: boolean;
  paginate?: boolean;
  sortableFields?: string[];
  filterableFields?: string[];
  searchFields?: string[];
  hasSortable?: boolean;
  hasFilterable?: boolean;
  hasSearch?: boolean;
  entityFilterableFields?: string[];
  hasEntityFilterableFields?: boolean;
  listPermission?: string;
  createPermission?: string;
  updatePermission?: string;
  deletePermission?: string;
  needsAuth?: boolean;
  applyTenantFilter?: boolean;
  tenantField?: string;
  ownershipField?: string;
  hasOwnership?: boolean;
  hasAnyRecordFilter?: boolean;
  hasCacheInvalidation?: boolean;
  cacheImports?: CrudCacheImport[];
  createCacheInvalidations?: CrudCacheInvalidation[];
  updateCacheInvalidations?: CrudCacheInvalidation[];
  deleteCacheInvalidations?: CrudCacheInvalidation[];
  hasOutboundWebhooks?: boolean;
  outboundWebhookDispatchers?: CrudOutboundWebhookDispatcher[];

  // ── Realtime ─────────────────────────────────────────────────────────────
  events?: string[];

  // ── Jobs ─────────────────────────────────────────────────────────────────
  schedule?: string | undefined;
  hasSchedule?: boolean;
  priority?: number;
  retryLimit?: number;
  retryDelay?: number;
  retryMultiplier?: number;
  isExponential?: boolean;
  hasDeadLetter?: boolean;
  dlqQueue?: string;

  // ── Storage ──────────────────────────────────────────────────────────────
  storageName?: string;
  storageConst?: string;
  storageSlug?: string;
  provider?: string;
  isLocal?: boolean;
  isS3?: boolean;
  isR2?: boolean;
  isGcs?: boolean;
  isCloud?: boolean;
  bucket?: string;
  maxSize?: string;
  allowedTypes?: string[];
  hasAllowedTypes?: boolean;
  publicPath?: string;
  envPrefix?: string;

  // ── Email ────────────────────────────────────────────────────────────────
  from?: string;
  templates?: EmailTemplateRenderEntry[];

  // ── Cache ─────────────────────────────────────────────────────────────────
  defaultTtl?: number;
  redisUrlEnvVar?: string;

  // ── Webhook ──────────────────────────────────────────────────────────────
  usesPgBoss?: boolean;
  usesBullMQ?: boolean;
  webhookName?: string;
  webhookConst?: string;
  webhookPascal?: string;
  hasSecret?: boolean;
  secretEnvVar?: string;
  hasVerifyWith?: boolean;
  verifyWith?: string;
  isStripeSignature?: boolean;
  isGithubSignature?: boolean;
  isHmac?: boolean;
  fnExport?: string;
  fnIsDefault?: boolean;
  targetsEnvVar?: string;
  retry?: number;
  retryAttempts?: number;

  // ── Observability ─────────────────────────────────────────────────────────
  tracing?: boolean;
  metrics?: boolean;
  exporter?: string;
  errorTracking?: string;
  hasOtlpExporter?: boolean;
  hasPrometheusExporter?: boolean;
  hasSentry?: boolean;
  hasDatadog?: boolean;

  // ── Admin (entity-spread fields) ──────────────────────────────────────────
  /** FieldNode array when an EntityNode is spread directly into template data */
  fields?: FieldNode[];
  /** SourceLocation when an EntityNode is spread directly into template data */
  loc?: SourceLocation;
  /** Discriminant literal when an EntityNode is spread into template data */
  type?: string;
  manyToOneRelations?: AdminManyToOneRelation[];
  hasManyToOneRelations?: boolean;
  uniqueRelatedEntities?: (string | undefined)[];

  // ── Frontend ─────────────────────────────────────────────────────────────
  pagesMap?: Record<string, string>;
  hasClientTypes?: boolean;
  componentName?: string;
  componentSource?: string;
  isProtected?: boolean;
  noLayout?: boolean;
  navRoutes?: Array<{ label: string; path: string; icon?: string }>;
  darkModeSelector?: string;
  darkModeClass?: string;
  appTitle?: string;

  // ── AutoPage ─────────────────────────────────────────────────────────────
  autoPage?: AutoPageNode;
  resolvedColumns?: AutoPageResolvedColumn[];
  resolvedFields?: AutoPageResolvedField[];
  entityNameCamel?: string;
  entityNamePascal?: string;
  layout?: string;
  isTwoColumn?: boolean;
  hasColumns?: boolean;
  hasFields?: boolean;
  hasSearchable?: boolean;
  hasRowActions?: boolean;
  hasTopActions?: boolean;
  hasCreate?: boolean;
  hasExport?: boolean;
  hasViewRow?: boolean;
  hasEditRow?: boolean;
  hasDeleteRow?: boolean;
  hasPaginate?: boolean;
  pageSize?: number;
  successRoute?: string;
  pageTitle?: string;
  fieldCount?: number;
  createPath?: string;
  editPath?: string;
  viewPath?: string;
  hasRichTextFields?: boolean;
}
