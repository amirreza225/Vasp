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

export const DEFAULT_BACKEND_PORT = 3001;
export const DEFAULT_SPA_PORT = 5173;
export const DEFAULT_SSR_PORT = 3000;
