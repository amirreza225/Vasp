/**
 * completions.ts — Context-aware completion items for the Vasp DSL.
 *
 * Uses context-detector.ts to determine what block/sub-block the cursor is in,
 * then returns appropriate CompletionItem[] with documentation and auto-insert snippets.
 */

import type {
  CompletionItem,
  Connection,
  TextDocuments,
} from "vscode-languageserver";
import { CompletionItemKind, InsertTextFormat } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { detectCursorContext } from "../utils/context-detector.js";
import { VASP_DOCS } from "../utils/vasp-docs.js";
import type { VaspDocumentStore } from "../utils/document-store.js";

// ── Completion item factories ─────────────────────────────────────────────────

function keyword(
  label: string,
  snippet: string,
  detail?: string,
  doc?: string,
): CompletionItem {
  const resolvedDetail = detail ?? VASP_DOCS[label]?.detail;
  const resolvedDoc = doc ?? VASP_DOCS[label]?.documentation;
  const item: CompletionItem = {
    label,
    kind: CompletionItemKind.Keyword,
    insertText: snippet,
    insertTextFormat: InsertTextFormat.Snippet,
  };
  if (resolvedDetail !== undefined) item.detail = resolvedDetail;
  if (resolvedDoc !== undefined)
    item.documentation = { kind: "markdown", value: resolvedDoc };
  return item;
}

function value(label: string, detail?: string, doc?: string): CompletionItem {
  const resolvedDetail = detail ?? VASP_DOCS[label]?.detail;
  const resolvedDoc = doc ?? VASP_DOCS[label]?.documentation;
  const item: CompletionItem = {
    label,
    kind: CompletionItemKind.Value,
    insertText: label,
    insertTextFormat: InsertTextFormat.PlainText,
  };
  if (resolvedDetail !== undefined) item.detail = resolvedDetail;
  if (resolvedDoc !== undefined)
    item.documentation = { kind: "markdown", value: resolvedDoc };
  return item;
}

function entityName(label: string): CompletionItem {
  return {
    label,
    kind: CompletionItemKind.Class,
    detail: "entity",
    insertText: label,
    insertTextFormat: InsertTextFormat.PlainText,
  };
}

function pageName(label: string): CompletionItem {
  return {
    label,
    kind: CompletionItemKind.Module,
    detail: "page",
    insertText: label,
    insertTextFormat: InsertTextFormat.PlainText,
  };
}

// ── Top-level block snippets ──────────────────────────────────────────────────

const TOP_LEVEL_COMPLETIONS: CompletionItem[] = [
  keyword(
    "app",
    `app \${1:AppName} {\n  title: "\${2:My App}"\n  db: Drizzle\n  ssr: false\n  typescript: true\n}`,
    "Application root block (required)",
  ),
  keyword(
    "entity",
    `entity \${1:Name} {\n  id: Int @id\n  \${2:field}: \${3:String}\n}`,
    "Database entity",
  ),
  keyword(
    "crud",
    `crud \${1:Name} {\n  entity: \${2:Entity}\n  operations: [list, create, update, delete]\n}`,
    "REST CRUD endpoints",
  ),
  keyword(
    "auth",
    `auth \${1:Name} {\n  userEntity: \${2:User}\n  methods: [usernameAndPassword]\n}`,
    "Authentication block",
  ),
  keyword(
    "route",
    `route \${1:Name} {\n  path: "\${2:/}"\n  to: \${3:PageName}\n}`,
    "Frontend route",
  ),
  keyword(
    "page",
    `page \${1:Name} {\n  component: import \${1:Name} from "@src/pages/\${1:Name}.vue"\n}`,
    "Frontend page",
  ),
  keyword(
    "query",
    `query \${1:name} {\n  fn: import { \${1:name} } from "@src/queries.ts"\n  entities: [\${2:Entity}]\n}`,
    "Server query",
  ),
  keyword(
    "action",
    `action \${1:name} {\n  fn: import { \${1:name} } from "@src/actions.ts"\n  entities: [\${2:Entity}]\n}`,
    "Server action",
  ),
  keyword(
    "api",
    `api \${1:name} {\n  method: GET\n  path: "\${2:/api/\${1:name}}"\n  fn: import { \${1:name} } from "@src/api/\${1:name}.ts"\n}`,
    "Custom API endpoint",
  ),
  keyword(
    "middleware",
    `middleware \${1:name} {\n  fn: import { \${1:name} } from "@src/middleware/\${1:name}.ts"\n  scope: global\n}`,
    "Custom middleware",
  ),
  keyword(
    "job",
    `job \${1:name} {\n  executor: PgBoss\n  perform {\n    fn: import { \${1:name} } from "@src/jobs/\${1:name}.ts"\n  }\n}`,
    "Background job",
  ),
  keyword(
    "realtime",
    `realtime \${1:name} {\n  entity: \${2:Entity}\n}`,
    "WebSocket channel",
  ),
  keyword(
    "storage",
    `storage \${1:uploads} {\n  provider: local\n  maxSize: "10mb"\n  allowedTypes: ["image/jpeg", "image/png"]\n  publicPath: "/uploads"\n}`,
    "File storage",
  ),
  keyword(
    "email",
    `email \${1:mailer} {\n  provider: resend\n  from: "\${2:noreply@example.com}"\n}`,
    "Email provider",
  ),
  keyword(
    "cache",
    `cache \${1:apiCache} {\n  provider: memory\n  ttl: 60\n}`,
    "Cache store",
  ),
  keyword(
    "admin",
    `admin \${1:AdminPanel} {\n  entities: [\${2:Entity}]\n}`,
    "Admin panel",
  ),
  keyword(
    "seed",
    `seed \${1:main} {\n  fn: import { \${2:seedDatabase} } from "@src/seed.ts"\n}`,
    "Database seed",
  ),
  keyword(
    "webhook",
    `webhook \${1:name} {\n  mode: inbound\n  path: "\${2:/webhooks/\${1:name}}"\n  fn: import { \${3:handler} } from "@src/webhooks/\${1:name}.ts"\n}`,
    "Webhook",
  ),
  keyword(
    "observability",
    `observability \${1:ops} {\n  tracing: true\n  metrics: true\n  logs: structured\n  exporter: otlp\n}`,
    "Observability config",
  ),
  keyword(
    "autoPage",
    `autoPage \${1:name} {\n  entity: \${2:Entity}\n  pageType: list\n}`,
    "Auto-generated page",
  ),
];

// ── Field type completions ────────────────────────────────────────────────────

const FIELD_TYPE_COMPLETIONS: CompletionItem[] = [
  "String",
  "Int",
  "Boolean",
  "DateTime",
  "Float",
  "Text",
  "Json",
  "File",
].map((t) => value(t));
FIELD_TYPE_COMPLETIONS.push(
  keyword("Enum", `Enum(\${1:val1, val2})`, "Enumerated values"),
);

// ── Field modifier completions ────────────────────────────────────────────────

const FIELD_MODIFIER_COMPLETIONS: CompletionItem[] = [
  "@id",
  "@unique",
  "@nullable",
  "@updatedAt",
  "@manyToMany",
  "@hidden",
].map((m): CompletionItem => {
  const item: CompletionItem = {
    label: m,
    kind: CompletionItemKind.Property,
    insertText: m.slice(1), // strip leading @
    insertTextFormat: InsertTextFormat.PlainText,
  };
  const doc = VASP_DOCS[m];
  if (doc?.detail !== undefined) item.detail = doc.detail;
  if (doc?.documentation !== undefined)
    item.documentation = { kind: "markdown", value: doc.documentation };
  return item;
});
FIELD_MODIFIER_COMPLETIONS.push(
  {
    label: "@default",
    kind: CompletionItemKind.Property,
    detail: "Column default value",
    insertText: "@default(${1:now})",
    insertTextFormat: InsertTextFormat.Snippet,
  },
  {
    label: "@storage",
    kind: CompletionItemKind.Property,
    detail: "@storage(StorageName)",
    insertText: "@storage(${1:uploads})",
    insertTextFormat: InsertTextFormat.Snippet,
  },
  {
    label: "@onDelete",
    kind: CompletionItemKind.Property,
    detail: "FK delete behavior",
    insertText: "@onDelete(${1|cascade,restrict,setNull|})",
    insertTextFormat: InsertTextFormat.Snippet,
  },
  {
    label: "@validate",
    kind: CompletionItemKind.Property,
    detail: "Inline validation",
    insertText: "@validate(${1:email})",
    insertTextFormat: InsertTextFormat.Snippet,
  },
);

// ── Executor completions ──────────────────────────────────────────────────────

const EXECUTOR_COMPLETIONS: CompletionItem[] = [
  {
    label: "PgBoss",
    kind: CompletionItemKind.EnumMember,
    detail: "PostgreSQL-backed job queue",
    documentation: {
      kind: "markdown",
      value: VASP_DOCS["PgBoss"]?.documentation ?? "",
    },
    insertText: `PgBoss\n  perform {\n    fn: import { \${1:workerFn} } from "@src/jobs/\${2:worker}.ts"\n  }\n  retries: \${3:3}`,
    insertTextFormat: InsertTextFormat.Snippet,
  },
  {
    label: "BullMQ",
    kind: CompletionItemKind.EnumMember,
    detail: "Redis-backed job queue",
    documentation: {
      kind: "markdown",
      value: VASP_DOCS["BullMQ"]?.documentation ?? "",
    },
    insertText: `BullMQ\n  perform {\n    fn: import { \${1:workerFn} } from "@src/jobs/\${2:worker}.ts"\n    concurrency: \${3:5}\n  }\n  retries: \${4:3}`,
    insertTextFormat: InsertTextFormat.Snippet,
  },
  {
    label: "RedisStreams",
    kind: CompletionItemKind.EnumMember,
    detail: "Redis Streams-backed queue",
    insertText: "RedisStreams",
    insertTextFormat: InsertTextFormat.PlainText,
  },
  {
    label: "RabbitMQ",
    kind: CompletionItemKind.EnumMember,
    detail: "AMQP/RabbitMQ message queue",
    insertText: "RabbitMQ",
    insertTextFormat: InsertTextFormat.PlainText,
  },
  {
    label: "Kafka",
    kind: CompletionItemKind.EnumMember,
    detail: "Apache Kafka event streaming",
    insertText: "Kafka",
    insertTextFormat: InsertTextFormat.PlainText,
  },
];

// ── Storage provider completions ──────────────────────────────────────────────

const STORAGE_PROVIDER_COMPLETIONS: CompletionItem[] = [
  "local",
  "s3",
  "r2",
  "gcs",
].map((p) => value(p, `Storage provider: ${p}`));

// ── Email provider completions ────────────────────────────────────────────────

const EMAIL_PROVIDER_COMPLETIONS: CompletionItem[] = [
  "resend",
  "sendgrid",
  "smtp",
].map((p) => value(p, `Email provider: ${p}`));

// ── Cache provider completions ────────────────────────────────────────────────

const CACHE_PROVIDER_COMPLETIONS: CompletionItem[] = [
  "memory",
  "redis",
  "valkey",
].map((p) => value(p, `Cache provider: ${p}`));

// ── Auth methods completions ──────────────────────────────────────────────────

const AUTH_METHOD_COMPLETIONS: CompletionItem[] = [
  "usernameAndPassword",
  "google",
  "github",
].map((m) => value(m, `Auth method: ${m}`));

// ── CRUD sub-block keyword completions ────────────────────────────────────────

const CRUD_SUB_COMPLETIONS: CompletionItem[] = [
  keyword(
    "list",
    `list {\n  paginate: \${1:true}\n  sortable: [\${2:}]\n}`,
    "CRUD list configuration",
  ),
  keyword(
    "form",
    `form {\n  layout: "\${1|1-column,2-column,tabs,steps|}"\n}`,
    "CRUD form layout",
  ),
  keyword(
    "permissions",
    `permissions {\n  list: [admin, user]\n  create: [admin]\n  update: [admin]\n  delete: [admin]\n}`,
    "CRUD permissions",
  ),
];

// ── CRUD form sub-block completions ───────────────────────────────────────────

const CRUD_FORM_COMPLETIONS: CompletionItem[] = [
  keyword(
    "sections",
    `sections {\n  \${1:basics} { label: "\${2:Basic Info}" fields: [\${3:}] }\n}`,
    "Form sections (tabs)",
  ),
  keyword(
    "steps",
    `steps {\n  \${1:step1} { label: "\${2:Details}" fields: [\${3:}] }\n}`,
    "Form wizard steps",
  ),
  {
    label: "layout",
    kind: CompletionItemKind.Property,
    detail: "Form layout type",
    insertText: 'layout: "${1|1-column,2-column,tabs,steps|}"',
    insertTextFormat: InsertTextFormat.Snippet,
  },
];

// ── Observability completions ─────────────────────────────────────────────────

const OBSERVABILITY_EXPORTER_COMPLETIONS: CompletionItem[] = [
  "console",
  "otlp",
  "prometheus",
].map((e) => value(e, `Observability exporter: ${e}`));

const OBSERVABILITY_ERROR_TRACKING_COMPLETIONS: CompletionItem[] = [
  "none",
  "sentry",
  "datadog",
].map((e) => value(e, `Error tracking: ${e}`));

// ── Entity field config completions ──────────────────────────────────────────

const FIELD_CONFIG_COMPLETIONS: CompletionItem[] = [
  {
    label: "label",
    kind: CompletionItemKind.Property,
    detail: "Display label for the field",
    insertText: 'label: "${1:Field Label}"',
    insertTextFormat: InsertTextFormat.Snippet,
  },
  {
    label: "placeholder",
    kind: CompletionItemKind.Property,
    detail: "Placeholder text for inputs",
    insertText: 'placeholder: "${1:Enter value…}"',
    insertTextFormat: InsertTextFormat.Snippet,
  },
  {
    label: "description",
    kind: CompletionItemKind.Property,
    detail: "Help text shown below the input",
    insertText: 'description: "${1:Help text}"',
    insertTextFormat: InsertTextFormat.Snippet,
  },
  {
    label: "default",
    kind: CompletionItemKind.Property,
    detail: "Default value override",
    insertText: "default: ${1:value}",
    insertTextFormat: InsertTextFormat.Snippet,
  },
  keyword(
    "validate",
    `validate {\n  required: \${1:true}\n}`,
    "Validation rules",
  ),
];

// ── Entity field validate completions ────────────────────────────────────────

const FIELD_VALIDATE_COMPLETIONS: CompletionItem[] = [
  {
    label: "required",
    kind: CompletionItemKind.Property,
    insertText: "required: ${1:true}",
    insertTextFormat: InsertTextFormat.Snippet,
  },
  {
    label: "minLength",
    kind: CompletionItemKind.Property,
    insertText: "minLength: ${1:3}",
    insertTextFormat: InsertTextFormat.Snippet,
  },
  {
    label: "maxLength",
    kind: CompletionItemKind.Property,
    insertText: "maxLength: ${1:120}",
    insertTextFormat: InsertTextFormat.Snippet,
  },
  {
    label: "min",
    kind: CompletionItemKind.Property,
    insertText: "min: ${1:0}",
    insertTextFormat: InsertTextFormat.Snippet,
  },
  {
    label: "max",
    kind: CompletionItemKind.Property,
    insertText: "max: ${1:100}",
    insertTextFormat: InsertTextFormat.Snippet,
  },
  {
    label: "pattern",
    kind: CompletionItemKind.Property,
    insertText: 'pattern: "${1:^[a-z]+$}"',
    insertTextFormat: InsertTextFormat.Snippet,
  },
  {
    label: "custom",
    kind: CompletionItemKind.Property,
    insertText: 'custom: "@src/validators/${1:myValidator}.ts"',
    insertTextFormat: InsertTextFormat.Snippet,
  },
];

// ── Main completion provider ──────────────────────────────────────────────────

export function getCompletions(
  text: string,
  offset: number,
  store: VaspDocumentStore,
): CompletionItem[] {
  const ctx = detectCursorContext(text, offset);

  switch (ctx.type) {
    case "top-level":
      return TOP_LEVEL_COMPLETIONS;

    case "entity":
      return [
        ...FIELD_TYPE_COMPLETIONS.map((c) => ({
          ...c,
          label: c.label,
          detail: `field type: ${c.label}`,
        })),
      ];

    case "entity-field-type":
      return FIELD_TYPE_COMPLETIONS;

    case "entity-field-modifier":
      return FIELD_MODIFIER_COMPLETIONS;

    case "entity-field-config":
      return FIELD_CONFIG_COMPLETIONS;

    case "entity-field-validate":
      return FIELD_VALIDATE_COMPLETIONS;

    case "crud":
      return [
        ...CRUD_SUB_COMPLETIONS,
        {
          label: "entity",
          kind: CompletionItemKind.Property,
          detail: "Entity reference",
          insertText: "entity: ${1:Entity}",
          insertTextFormat: InsertTextFormat.Snippet,
        },
        {
          label: "operations",
          kind: CompletionItemKind.Property,
          detail: "CRUD operations",
          insertText: "operations: [${1|list,create,update,delete|}]",
          insertTextFormat: InsertTextFormat.Snippet,
        },
      ];

    case "crud-list":
      return [
        {
          label: "paginate",
          kind: CompletionItemKind.Property,
          insertText: "paginate: ${1:true}",
          insertTextFormat: InsertTextFormat.Snippet,
        },
        {
          label: "sortable",
          kind: CompletionItemKind.Property,
          insertText: "sortable: [${1:}]",
          insertTextFormat: InsertTextFormat.Snippet,
        },
        {
          label: "filterable",
          kind: CompletionItemKind.Property,
          insertText: "filterable: [${1:}]",
          insertTextFormat: InsertTextFormat.Snippet,
        },
        {
          label: "search",
          kind: CompletionItemKind.Property,
          insertText: "search: [${1:}]",
          insertTextFormat: InsertTextFormat.Snippet,
        },
        keyword(
          "columns",
          `columns {\n  \${1:fieldName} { label: "\${2:Column}" width: "\${3:auto}" }\n}`,
          "Column display config",
        ),
      ];

    case "crud-columns":
      return [
        {
          label: "label",
          kind: CompletionItemKind.Property,
          insertText: 'label: "${1:Column Label}"',
          insertTextFormat: InsertTextFormat.Snippet,
        },
        {
          label: "width",
          kind: CompletionItemKind.Property,
          insertText: 'width: "${1:auto}"',
          insertTextFormat: InsertTextFormat.Snippet,
        },
        {
          label: "sortable",
          kind: CompletionItemKind.Property,
          insertText: "sortable: ${1:true}",
          insertTextFormat: InsertTextFormat.Snippet,
        },
        {
          label: "filterable",
          kind: CompletionItemKind.Property,
          insertText: "filterable: ${1:true}",
          insertTextFormat: InsertTextFormat.Snippet,
        },
        {
          label: "hidden",
          kind: CompletionItemKind.Property,
          insertText: "hidden: ${1:false}",
          insertTextFormat: InsertTextFormat.Snippet,
        },
      ];

    case "crud-form":
      return CRUD_FORM_COMPLETIONS;

    case "crud-sections":
    case "crud-steps":
      return [
        {
          label: "label",
          kind: CompletionItemKind.Property,
          insertText: 'label: "${1:Section Label}"',
          insertTextFormat: InsertTextFormat.Snippet,
        },
        {
          label: "fields",
          kind: CompletionItemKind.Property,
          insertText: "fields: [${1:fieldName}]",
          insertTextFormat: InsertTextFormat.Snippet,
        },
      ];

    case "crud-permissions":
      return [
        {
          label: "list",
          kind: CompletionItemKind.Property,
          insertText: "list: [${1:admin, user}]",
          insertTextFormat: InsertTextFormat.Snippet,
        },
        {
          label: "create",
          kind: CompletionItemKind.Property,
          insertText: "create: [${1:admin}]",
          insertTextFormat: InsertTextFormat.Snippet,
        },
        {
          label: "update",
          kind: CompletionItemKind.Property,
          insertText: "update: [${1:admin}]",
          insertTextFormat: InsertTextFormat.Snippet,
        },
        {
          label: "delete",
          kind: CompletionItemKind.Property,
          insertText: "delete: [${1:admin}]",
          insertTextFormat: InsertTextFormat.Snippet,
        },
      ];

    case "job":
      return [
        {
          label: "executor",
          kind: CompletionItemKind.Property,
          detail: "Job executor type",
          insertText:
            "executor: ${1|PgBoss,BullMQ,RedisStreams,RabbitMQ,Kafka|}",
          insertTextFormat: InsertTextFormat.Snippet,
        },
        keyword(
          "perform",
          `perform {\n  fn: import { \${1:workerFn} } from "@src/jobs/\${2:worker}.ts"\n}`,
          "Job perform block",
        ),
        {
          label: "schedule",
          kind: CompletionItemKind.Property,
          insertText: 'schedule: "${1:0 9 * * *}"',
          insertTextFormat: InsertTextFormat.Snippet,
        },
        {
          label: "retries",
          kind: CompletionItemKind.Property,
          insertText: "retries: ${1:3}",
          insertTextFormat: InsertTextFormat.Snippet,
        },
      ];

    case "storage":
      return [
        {
          label: "provider",
          kind: CompletionItemKind.Property,
          insertText: "provider: ${1|local,s3,r2,gcs|}",
          insertTextFormat: InsertTextFormat.Snippet,
        },
        {
          label: "bucket",
          kind: CompletionItemKind.Property,
          insertText: 'bucket: "${1:my-bucket}"',
          insertTextFormat: InsertTextFormat.Snippet,
        },
        {
          label: "maxSize",
          kind: CompletionItemKind.Property,
          insertText: 'maxSize: "${1:10mb}"',
          insertTextFormat: InsertTextFormat.Snippet,
        },
        {
          label: "allowedTypes",
          kind: CompletionItemKind.Property,
          insertText: 'allowedTypes: ["${1:image/jpeg}"]',
          insertTextFormat: InsertTextFormat.Snippet,
        },
        {
          label: "publicPath",
          kind: CompletionItemKind.Property,
          insertText: 'publicPath: "/${1:uploads}"',
          insertTextFormat: InsertTextFormat.Snippet,
        },
      ];

    case "email":
      return [
        {
          label: "provider",
          kind: CompletionItemKind.Property,
          insertText: "provider: ${1|resend,sendgrid,smtp|}",
          insertTextFormat: InsertTextFormat.Snippet,
        },
        {
          label: "from",
          kind: CompletionItemKind.Property,
          insertText: 'from: "${1:noreply@example.com}"',
          insertTextFormat: InsertTextFormat.Snippet,
        },
      ];

    case "cache":
      return [
        {
          label: "provider",
          kind: CompletionItemKind.Property,
          insertText: "provider: ${1|memory,redis,valkey|}",
          insertTextFormat: InsertTextFormat.Snippet,
        },
        {
          label: "ttl",
          kind: CompletionItemKind.Property,
          insertText: "ttl: ${1:60}",
          insertTextFormat: InsertTextFormat.Snippet,
        },
      ];

    case "auth":
      return [
        {
          label: "userEntity",
          kind: CompletionItemKind.Property,
          insertText: "userEntity: ${1:User}",
          insertTextFormat: InsertTextFormat.Snippet,
        },
        {
          label: "methods",
          kind: CompletionItemKind.Property,
          insertText: "methods: [${1|usernameAndPassword,google,github|}]",
          insertTextFormat: InsertTextFormat.Snippet,
        },
        ...store.allEntities().map((e) => entityName(e.name)),
      ];

    case "observability":
      return [
        {
          label: "tracing",
          kind: CompletionItemKind.Property,
          insertText: "tracing: ${1:true}",
          insertTextFormat: InsertTextFormat.Snippet,
        },
        {
          label: "metrics",
          kind: CompletionItemKind.Property,
          insertText: "metrics: ${1:true}",
          insertTextFormat: InsertTextFormat.Snippet,
        },
        {
          label: "logs",
          kind: CompletionItemKind.Property,
          insertText: "logs: ${1|console,structured|}",
          insertTextFormat: InsertTextFormat.Snippet,
        },
        {
          label: "exporter",
          kind: CompletionItemKind.Property,
          insertText: "exporter: ${1|console,otlp,prometheus|}",
          insertTextFormat: InsertTextFormat.Snippet,
        },
        {
          label: "errorTracking",
          kind: CompletionItemKind.Property,
          insertText: "errorTracking: ${1|none,sentry,datadog|}",
          insertTextFormat: InsertTextFormat.Snippet,
        },
      ];

    case "after-colon": {
      const { key, blockKind } = ctx;
      if (key === "executor") return EXECUTOR_COMPLETIONS;
      if (key === "provider") {
        if (blockKind === "storage") return STORAGE_PROVIDER_COMPLETIONS;
        if (blockKind === "email") return EMAIL_PROVIDER_COMPLETIONS;
        if (blockKind === "cache") return CACHE_PROVIDER_COMPLETIONS;
      }
      if (key === "methods") return AUTH_METHOD_COMPLETIONS;
      if (key === "entity" || key === "userEntity")
        return store.allEntities().map((e) => entityName(e.name));
      if (key === "to") return store.allPages().map((p) => pageName(p.name));
      if (key === "exporter") return OBSERVABILITY_EXPORTER_COMPLETIONS;
      if (key === "errorTracking")
        return OBSERVABILITY_ERROR_TRACKING_COMPLETIONS;
      if (key === "layout")
        return ["1-column", "2-column", "tabs", "steps"].map((v) => value(v));
      if (key === "ssr") return [value("false"), value("true"), value('"ssg"')];
      if (key === "typescript") return [value("true"), value("false")];
      return [];
    }

    default:
      return [];
  }
}

/** Register completions handler on the LSP connection */
export function registerCompletionsHandler(
  connection: Connection,
  documents: TextDocuments<TextDocument>,
  store: VaspDocumentStore,
): void {
  connection.onCompletion((params) => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc || !params.textDocument.uri.endsWith(".vasp")) return [];
    const text = doc.getText();
    const offset = doc.offsetAt(params.position);
    return getCompletions(text, offset, store);
  });

  connection.onCompletionResolve((item) => item);
}
