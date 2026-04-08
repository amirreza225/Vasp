export const VASP_VERSION = "1.3.0";

export const VASP_FILE_EXTENSION = ".vasp";
export const VASP_ENTRY_FILE = "main.vasp";
export const VASP_GEN_DIR = ".vasp-gen";

export const SUPPORTED_AUTH_METHODS = [
  "usernameAndPassword",
  "google",
  "github",
] as const;
export const SUPPORTED_API_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
] as const;
export const SUPPORTED_MIDDLEWARE_SCOPES = ["global", "route"] as const;
export const SUPPORTED_CRUD_OPERATIONS = [
  "list",
  "create",
  "update",
  "delete",
] as const;
export const SUPPORTED_REALTIME_EVENTS = [
  "created",
  "updated",
  "deleted",
] as const;
export const SUPPORTED_JOB_EXECUTORS = [
  "PgBoss",
  "BullMQ",
  "RedisStreams",
  "RabbitMQ",
  "Kafka",
] as const;
export const SUPPORTED_JOB_BACKOFF_STRATEGIES = [
  "fixed",
  "exponential",
] as const;
export const SUPPORTED_FIELD_TYPES = [
  "String",
  "Int",
  "Boolean",
  "DateTime",
  "Float",
  "Text",
  "Json",
  "Enum",
  "File",
  "RichText",
] as const;

export const SUPPORTED_STORAGE_PROVIDERS = [
  "local",
  "s3",
  "r2",
  "gcs",
] as const;

export const SUPPORTED_EMAIL_PROVIDERS = [
  "resend",
  "sendgrid",
  "smtp",
] as const;

export const SUPPORTED_CACHE_PROVIDERS = ["memory", "redis", "valkey"] as const;

export const SUPPORTED_WEBHOOK_VERIFICATIONS = [
  "stripe-signature",
  "github-signature",
  "hmac",
] as const;

export const SUPPORTED_OBSERVABILITY_EXPORTERS = [
  "otlp",
  "prometheus",
  "console",
] as const;

export const SUPPORTED_ERROR_TRACKING_PROVIDERS = [
  "sentry",
  "datadog",
  "none",
] as const;

export const SUPPORTED_OBSERVABILITY_LOGS_MODES = [
  "structured",
  "console",
] as const;

export const SUPPORTED_MULTI_TENANT_STRATEGIES = [
  "row-level",
  "schema-level",
  "database-level",
] as const;

export const SUPPORTED_AUTOPAGE_TYPES = ["list", "form", "detail"] as const;

export const SUPPORTED_AUTOPAGE_ROW_ACTIONS = [
  "view",
  "edit",
  "delete",
] as const;

export const SUPPORTED_AUTOPAGE_TOP_ACTIONS = ["create", "export"] as const;

export const SUPPORTED_AUTOPAGE_LAYOUTS = [
  "1-column",
  "2-column",
  "tabs",
  "wizard",
] as const;

/**
 * Valid layout values for the `form {}` sub-block inside a `crud` block.
 * Unlike AutoPage layouts (which use "wizard"), CRUD form layouts use "steps"
 * to match the DSL keyword used to declare step definitions.
 */
export const SUPPORTED_FORM_LAYOUTS = [
  "1-column",
  "2-column",
  "tabs",
  "steps",
] as const;

/**
 * Valid rule keys inside the `validate {}` sub-block of a field config block.
 * Used by the parser and language server for validation and completions.
 */
export const FIELD_VALIDATE_RULES = [
  "required",
  "minLength",
  "maxLength",
  "min",
  "max",
  "pattern",
  "custom",
] as const;

export const SUPPORTED_UI_THEMES = [
  "Aura",
  "Lara",
  "Nora",
  "Material",
] as const;

export const SUPPORTED_UI_PRIMARY_COLORS = [
  "emerald",
  "green",
  "lime",
  "red",
  "orange",
  "amber",
  "yellow",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
] as const;

export const DEFAULT_BACKEND_PORT = 3001;
export const DEFAULT_SPA_PORT = 5173;
export const DEFAULT_SSR_PORT = 3000;
export const DEFAULT_ADMIN_PORT = 5174;
