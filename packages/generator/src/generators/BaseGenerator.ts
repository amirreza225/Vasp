import { join } from "node:path";
import type { EntityNode, FieldNode } from "@vasp-framework/core";
import type { GeneratorContext } from "../GeneratorContext.js";
import type { Manifest } from "../manifest/Manifest.js";
import type { TemplateEngine } from "../template/TemplateEngine.js";
import { writeFile } from "../utils/fs.js";

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
    data: Record<string, unknown> = {},
  ): string {
    return this.engine.render(templateKey, { ...this.baseData(), ...data });
  }

  protected baseData(): Record<string, unknown> {
    const { ast, isTypeScript, isSsr, isSsg, isSpa, ext, mode } = this.ctx;
    const emails = ast.emails ?? [];
    const caches = ast.caches ?? [];
    const webhooks = ast.webhooks ?? [];
    const inboundWebhooks = webhooks.filter((w) => w.mode === "inbound");
    const outboundWebhooks = webhooks.filter((w) => w.mode === "outbound");
    return {
      appName: ast.app.name,
      appTitle: ast.app.title,
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
      hasStorage: (ast.storages?.length ?? 0) > 0,
      storages: ast.storages ?? [],
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
      webhooks,
      inboundWebhooks,
      outboundWebhooks,
      routes: ast.routes,
      pages: ast.pages,
      queries: ast.queries,
      actions: ast.actions,
      apis: ast.apis ?? [],
      middlewares: ast.middlewares ?? [],
      cruds: ast.cruds,
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
      autoPages: ast.autoPages ?? [],
      hasAutoPages: (ast.autoPages?.length ?? 0) > 0,
      ui: this.resolveUIConfig(ast.app?.ui),
    };
  }

  private resolveUIConfig(
    uiConfig: import("@vasp-framework/core").AppUIConfig | undefined,
  ): Record<string, unknown> {
    const theme = uiConfig?.theme ?? "Aura";
    const primaryColor = uiConfig?.primaryColor ?? null;
    const darkModeSelector = uiConfig?.darkModeSelector ?? ".app-dark";
    const ripple = uiConfig?.ripple ?? true;
    const PRIMARY_SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
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
