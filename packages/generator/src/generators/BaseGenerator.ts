import { join } from "node:path";
import type {
  AppUIConfig,
  AuthNode,
  AutoPageNode,
  CacheNode,
  CrudNode,
  EmailNode,
  EntityNode,
  FieldNode,
  JobNode,
  MiddlewareNode,
  MultiTenantConfig,
  ObservabilityNode,
  PageNode,
  QueryNode,
  ActionNode,
  ApiNode,
  RealtimeNode,
  RouteNode,
  SeedNode,
  StorageNode,
  WebhookNode,
} from "@vasp-framework/core";
import {
  DEFAULT_ADMIN_PORT,
  DEFAULT_BACKEND_PORT,
  DEFAULT_SPA_PORT,
  DEFAULT_SSR_PORT,
} from "@vasp-framework/core";
import type { GeneratorContext } from "../GeneratorContext.js";
import type { Manifest } from "../manifest/Manifest.js";
import type { TemplateEngine } from "../template/TemplateEngine.js";
import { writeFile } from "../utils/fs.js";

/** Resolved PrimeVue UI configuration exposed to every template via baseData(). */
export interface ResolvedUIConfig {
  theme: string;
  themeImportName: string;
  themeImportPath: string;
  primaryColor: string | null;
  hasPrimaryColor: boolean;
  primaryShades: Array<{ shade: number; token: string }>;
  darkModeSelector: string;
  ripple: boolean;
}

/**
 * Typed shape of the data object merged into every template render call.
 * All fields returned by BaseGenerator.baseData() are captured here so that
 * TypeScript can catch incorrect / missing values at compile time instead of
 * letting them surface as silent Handlebars rendering failures.
 */
export interface BaseTemplateData {
  // ── App identity ────────────────────────────────────────────────────────
  appName: string;
  appTitle: string;
  // ── Output mode ─────────────────────────────────────────────────────────
  isTypeScript: boolean;
  isSsr: boolean;
  isSsg: boolean;
  isSpa: boolean;
  /** File extension for generated source files: "ts" | "js" */
  ext: string;
  /** "ts" | "js" — alias for ext, used by some templates */
  mode: string;
  // ── Feature flags ───────────────────────────────────────────────────────
  hasAuth: boolean;
  hasAdmin: boolean;
  adminEntities: EntityNode[];
  hasAnyRelations: boolean;
  hasRealtime: boolean;
  hasJobs: boolean;
  hasPgBossJobs: boolean;
  hasBullMQJobs: boolean;
  hasRedisStreamsJobs: boolean;
  hasRabbitMQJobs: boolean;
  hasKafkaJobs: boolean;
  hasRedisJobs: boolean;
  hasCacheRedis: boolean;
  needsRedis: boolean;
  hasStorage: boolean;
  hasCloudStorage: boolean;
  storages: StorageNode[];
  hasEmail: boolean;
  hasEmailResend: boolean;
  hasEmailSendgrid: boolean;
  hasEmailSmtp: boolean;
  emails: EmailNode[];
  hasCache: boolean;
  caches: CacheNode[];
  hasWebhook: boolean;
  hasInboundWebhook: boolean;
  hasOutboundWebhook: boolean;
  /** True when outbound webhooks exist AND a PgBoss or BullMQ job executor is declared. */
  hasOutboundWebhookJobQueue: boolean;
  webhooks: WebhookNode[];
  inboundWebhooks: WebhookNode[];
  outboundWebhooks: WebhookNode[];
  // ── Collections ─────────────────────────────────────────────────────────
  routes: RouteNode[];
  pages: PageNode[];
  queries: QueryNode[];
  actions: ActionNode[];
  apis: ApiNode[];
  middlewares: MiddlewareNode[];
  cruds: CrudNode[];
  hasCrudListConfig: boolean;
  hasCrudFormConfig: boolean;
  realtimes: RealtimeNode[];
  jobs: JobNode[];
  seed: SeedNode | undefined;
  auth: AuthNode | undefined;
  // ── Multi-tenancy ────────────────────────────────────────────────────────
  multiTenant: MultiTenantConfig | null;
  hasMultiTenant: boolean;
  isRowLevelTenant: boolean;
  // ── Observability ────────────────────────────────────────────────────────
  observability: ObservabilityNode | null;
  hasObservability: boolean;
  hasObservabilityTracing: boolean;
  hasObservabilityMetrics: boolean;
  observabilityLogs: string;
  observabilityExporter: string;
  observabilityErrorTracking: string;
  hasObservabilityOtlp: boolean;
  hasObservabilityPrometheus: boolean;
  hasObservabilitySentry: boolean;
  hasObservabilityDatadog: boolean;
  hasStructuredLogs: boolean;
  // ── AutoPages ────────────────────────────────────────────────────────────
  autoPages: AutoPageNode[];
  hasAutoPages: boolean;
  // ── UI theming ───────────────────────────────────────────────────────────
  ui: ResolvedUIConfig;
  // ── Server ports ─────────────────────────────────────────────────────────
  backendPort: number;
  frontendPort: number;
  adminPort: number;
}

export abstract class BaseGenerator {
  constructor(
    protected readonly ctx: GeneratorContext,
    protected readonly engine: TemplateEngine,
    protected readonly filesWritten: string[],
    protected readonly manifest: Manifest,
  ) {}

  abstract run(): void;

  protected write(relativePath: string, content: string): void {
    const fullPath = join(this.ctx.outputDir, relativePath);
    writeFile(fullPath, content);
    this.filesWritten.push(relativePath);
    this.manifest.record(relativePath, content, this.constructor.name);
    this.ctx.logger.verbose(`  write ${relativePath}`);
  }

  protected render(
    templateKey: string,
    data: Partial<BaseTemplateData> & Record<string, unknown> = {},
  ): string {
    return this.engine.render(templateKey, { ...this.baseData(), ...data });
  }

  protected baseData(): BaseTemplateData {
    const { ast, isTypeScript, isSsr, isSsg, isSpa, ext, mode } = this.ctx;
    const emails = ast.emails;
    const caches = ast.caches;
    const webhooks = ast.webhooks;
    const inboundWebhooks = webhooks.filter((w) => w.mode === "inbound");
    const outboundWebhooks = webhooks.filter((w) => w.mode === "outbound");
    return {
      appName: ast.app!.name,
      appTitle: ast.app!.title,
      isTypeScript,
      isSsr,
      isSsg,
      isSpa,
      ext,
      mode,
      hasAuth: !!ast.auth,
      hasAdmin: !!ast.admin,
      adminEntities: ast.admin
        ? ast.admin.entities.map((name) => {
            const entity = ast.entities.find((e) => e.name === name);
            return (
              entity ?? {
                name,
                fields: [],
                type: "Entity" as const,
                loc: ast.admin!.loc,
              }
            );
          })
        : [],
      hasAnyRelations: ast.entities.some((e) =>
        e.fields.some((f) => f.isRelation),
      ),
      hasRealtime: ast.realtimes.length > 0,
      hasJobs: ast.jobs.length > 0,
      hasPgBossJobs: ast.jobs.some((j) => j.executor === "PgBoss"),
      hasBullMQJobs: ast.jobs.some((j) => j.executor === "BullMQ"),
      hasRedisStreamsJobs: ast.jobs.some((j) => j.executor === "RedisStreams"),
      hasRabbitMQJobs: ast.jobs.some((j) => j.executor === "RabbitMQ"),
      hasKafkaJobs: ast.jobs.some((j) => j.executor === "Kafka"),
      hasRedisJobs: ast.jobs.some(
        (j) => j.executor === "BullMQ" || j.executor === "RedisStreams",
      ),
      hasCacheRedis: caches.some(
        (c) => c.provider === "redis" || c.provider === "valkey",
      ),
      needsRedis:
        ast.jobs.some(
          (j) => j.executor === "BullMQ" || j.executor === "RedisStreams",
        ) ||
        caches.some((c) => c.provider === "redis" || c.provider === "valkey"),
      hasStorage: ast.storages.length > 0,
      hasCloudStorage: ast.storages.some((s) =>
        ["s3", "r2", "gcs"].includes(s.provider),
      ),
      storages: ast.storages,
      hasEmail: emails.length > 0,
      hasEmailResend: emails.some((e) => e.provider === "resend"),
      hasEmailSendgrid: emails.some((e) => e.provider === "sendgrid"),
      hasEmailSmtp: emails.some((e) => e.provider === "smtp"),
      emails,
      hasCache: caches.length > 0,
      caches,
      hasWebhook: webhooks.length > 0,
      hasInboundWebhook: inboundWebhooks.length > 0,
      hasOutboundWebhook: outboundWebhooks.length > 0,
      hasOutboundWebhookJobQueue:
        outboundWebhooks.length > 0 &&
        ast.jobs.some((j) => j.executor === "PgBoss" || j.executor === "BullMQ"),
      webhooks,
      inboundWebhooks,
      outboundWebhooks,
      routes: ast.routes,
      pages: ast.pages,
      queries: ast.queries,
      actions: ast.actions,
      apis: ast.apis,
      middlewares: ast.middlewares,
      cruds: ast.cruds,
      hasCrudListConfig: ast.cruds.some((c) => !!c.listConfig),
      hasCrudFormConfig: ast.cruds.some((c) => !!c.formConfig),
      realtimes: ast.realtimes,
      jobs: ast.jobs,
      seed: ast.seed,
      auth: ast.auth,
      multiTenant: ast.app?.multiTenant ?? null,
      hasMultiTenant: !!ast.app?.multiTenant,
      isRowLevelTenant: ast.app?.multiTenant?.strategy === "row-level",
      observability: ast.observability ?? null,
      hasObservability: !!ast.observability,
      hasObservabilityTracing: ast.observability?.tracing ?? false,
      hasObservabilityMetrics: ast.observability?.metrics ?? false,
      observabilityLogs: ast.observability?.logs ?? "console",
      observabilityExporter: ast.observability?.exporter ?? "console",
      observabilityErrorTracking: ast.observability?.errorTracking ?? "none",
      hasObservabilityOtlp: ast.observability?.exporter === "otlp",
      hasObservabilityPrometheus: ast.observability?.exporter === "prometheus",
      hasObservabilitySentry: ast.observability?.errorTracking === "sentry",
      hasObservabilityDatadog: ast.observability?.errorTracking === "datadog",
      hasStructuredLogs: ast.observability?.logs === "structured",
      autoPages: ast.autoPages,
      hasAutoPages: ast.autoPages.length > 0,
      ui: this.resolveUIConfig(ast.app?.ui),
      backendPort: DEFAULT_BACKEND_PORT,
      frontendPort: this.ctx.isSpa ? DEFAULT_SPA_PORT : DEFAULT_SSR_PORT,
      adminPort: DEFAULT_ADMIN_PORT,
    };
  }

  private resolveUIConfig(
    uiConfig: AppUIConfig | undefined,
  ): ResolvedUIConfig {
    const theme = uiConfig?.theme ?? "Aura";
    const primaryColor = uiConfig?.primaryColor ?? null;
    const darkModeSelector = uiConfig?.darkModeSelector ?? ".app-dark";
    const ripple = uiConfig?.ripple ?? true;
    const PRIMARY_SHADES = [
      50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950,
    ];
    return {
      theme,
      themeImportName: theme,
      themeImportPath: theme.toLowerCase(),
      primaryColor,
      hasPrimaryColor: primaryColor !== null,
      primaryShades: primaryColor
        ? PRIMARY_SHADES.map((shade) => ({
            shade,
            token: `{${primaryColor}.${shade}}`,
          }))
        : [],
      darkModeSelector,
      ripple,
    };
  }

  /**
   * Rewrites `@src/foo.js` → relative path from the given output directory.
   * E.g. from `server/routes/queries/` → `../../../src/foo.js`
   */
  protected resolveServerImport(source: string, fromDir: string): string {
    if (!source.startsWith("@src/")) return source;
    const depth = fromDir.replace(/\/$/, "").split("/").length;
    const prefix = "../".repeat(depth);
    return prefix + source.slice(1); // strip the leading '@'
  }

  /** Looks up an entity by name from the current AST */
  protected resolveEntity(entityName: string): EntityNode | undefined {
    return this.ctx.ast.entities?.find((e) => e.name === entityName);
  }

  /**
   * Maps a VASP field type to the most appropriate PrimeVue 4 form component name.
   * Used by AutoPageGenerator to select the right input for each field.
   */
  protected primevueComponentFor(field: FieldNode): string {
    switch (field.type) {
      case "Boolean":
        return "ToggleSwitch";
      case "DateTime":
        return "DatePicker";
      case "Int":
      case "Float":
        return "InputNumber";
      case "Enum":
        return "Select";
      case "Text":
      case "Json":
        return "Textarea";
      case "File":
        return "FileUpload";
      default:
        return "InputText";
    }
  }

  /**
   * Maps a VASP field type to a DataTable column display type hint.
   * Used by AutoPageGenerator to render cells correctly.
   */
  protected primevueColumnTypeFor(field: FieldNode): string {
    switch (field.type) {
      case "Boolean":
        return "boolean";
      case "DateTime":
        return "date";
      case "Int":
      case "Float":
        return "number";
      case "Enum":
        return "badge";
      default:
        return "text";
    }
  }
}
