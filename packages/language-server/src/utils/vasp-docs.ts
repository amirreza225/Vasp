/**
 * vasp-docs.ts — inline markdown documentation strings for all Vasp DSL constructs.
 *
 * Used by features/hover.ts and features/completions.ts to populate
 * documentation in CompletionItem.documentation and Hover.contents.
 */

export interface VaspDocEntry {
  /** Short one-liner shown in completion list */
  detail: string;
  /** Full markdown shown in hover panel */
  documentation: string;
}

export const VASP_DOCS: Record<string, VaspDocEntry> = {
  // ── Top-level block types ──────────────────────────────────────────────────

  app: {
    detail: "Application root block (required, exactly one)",
    documentation: `## \`app\`
The required root block. Declares your app name, database, frontend mode, and TypeScript preference.

**Required properties:**
- \`title\`: Display name
- \`db\`: Database adapter (\`Drizzle\`)
- \`ssr\`: \`false\` (SPA) | \`true\` (SSR) | \`"ssg"\` (Static)
- \`typescript\`: \`true\` | \`false\`

**Optional sub-blocks:** \`env {}\`, \`multiTenant {}\`, \`ui {}\`

\`\`\`vasp
app MyApp {
  title: "My Application"
  db: Drizzle
  ssr: false
  typescript: true
}
\`\`\``,
  },

  entity: {
    detail: "Database entity — maps to a Drizzle table + TypeScript interface",
    documentation: `## \`entity\`
Defines a database table with typed fields. Generates a Drizzle schema, TypeScript interface, and Valibot validation schema.

**Field types:** \`String\`, \`Int\`, \`Boolean\`, \`DateTime\`, \`Float\`, \`Text\`, \`Json\`, \`Enum(a,b,c)\`, \`File\`

**Modifiers:** \`@id\`, \`@unique\`, \`@nullable\`, \`@default(now)\`, \`@updatedAt\`, \`@manyToMany\`, \`@storage(Name)\`, \`@onDelete(cascade|restrict|setNull)\`, \`@validate(...)\`

**Table-level:** \`@@index([field1, field2])\`, \`@@unique([field1, field2])\`

\`\`\`vasp
entity Todo {
  id:    Int    @id
  title: String { label: "Task" validate { required: true, minLength: 3 } }
  done:  Boolean
}
\`\`\``,
  },

  crud: {
    detail: "REST CRUD endpoints for an entity",
    documentation: `## \`crud\`
Generates REST endpoints (list, create, update, delete) for an entity.

**Required properties:**
- \`entity\`: Entity name
- \`operations\`: Array of operations: \`[list, create, update, delete]\`

**Optional sub-blocks:** \`list {}\`, \`form {}\`, \`permissions {}\`

\`\`\`vasp
crud Todo {
  entity: Todo
  operations: [list, create, update, delete]
  list { paginate: true sortable: [title] }
}
\`\`\``,
  },

  auth: {
    detail: "Authentication block — JWT-based login/register",
    documentation: `## \`auth\`
Configures authentication. Generates login/register routes, JWT middleware, and Vue auth components.

**Required properties:**
- \`userEntity\`: Entity that represents users
- \`methods\`: Auth methods: \`[usernameAndPassword, google, github]\`

\`\`\`vasp
auth MyAuth {
  userEntity: User
  methods: [usernameAndPassword]
}
\`\`\``,
  },

  route: {
    detail: "Frontend route — maps a URL path to a page",
    documentation: `## \`route\`
Declares a URL path and links it to a page component.

\`\`\`vasp
route Home { path: "/" to: HomePage }
\`\`\``,
  },

  page: {
    detail: "Frontend page component",
    documentation: `## \`page\`
Declares a page by linking it to a Vue component import.

\`\`\`vasp
page HomePage { component: import HomePage from "@src/pages/Home.vue" }
\`\`\``,
  },

  query: {
    detail: "Server query — read-only data fetcher",
    documentation: `## \`query\`
Declares a server-side query function exposed to the frontend via the \`useQuery()\` composable.

\`\`\`vasp
query getTodos {
  fn: import { getTodos } from "@src/queries.ts"
  entities: [Todo]
  auth: true
}
\`\`\``,
  },

  action: {
    detail: "Server action — data mutation",
    documentation: `## \`action\`
Declares a server-side mutation function exposed to the frontend via the \`useAction()\` composable.

\`\`\`vasp
action createTodo {
  fn: import { createTodo } from "@src/actions.ts"
  entities: [Todo]
  auth: true
}
\`\`\``,
  },

  api: {
    detail: "Custom API endpoint",
    documentation: `## \`api\`
Declares a custom HTTP endpoint with a specific method and path.

\`\`\`vasp
api healthCheck {
  method: GET
  path: "/health"
  fn: import { healthCheck } from "@src/api/health.ts"
}
\`\`\``,
  },

  middleware: {
    detail: "Custom Elysia middleware",
    documentation: `## \`middleware\`
Declares a custom Elysia middleware function. \`scope: global\` applies to all routes; \`scope: route\` applies only to specific routes.

\`\`\`vasp
middleware cors {
  fn: import { corsMiddleware } from "@src/middleware/cors.ts"
  scope: global
}
\`\`\``,
  },

  realtime: {
    detail: "WebSocket realtime channel (requires matching crud block)",
    documentation: `## \`realtime\`
Generates a WebSocket channel for an entity. Requires a matching \`crud\` block for the same entity.

\`\`\`vasp
realtime todos { entity: Todo }
\`\`\``,
  },

  job: {
    detail: "Background job worker",
    documentation: `## \`job\`
Declares a background job. Supports PgBoss, BullMQ, RedisStreams, RabbitMQ, and Kafka executors.

**Executors:** \`PgBoss\`, \`BullMQ\`, \`RedisStreams\`, \`RabbitMQ\`, \`Kafka\`

\`\`\`vasp
job sendEmail {
  executor: PgBoss
  perform {
    fn: import { sendEmail } from "@src/jobs/email.ts"
  }
  schedule: "0 9 * * *"
}
\`\`\``,
  },

  seed: {
    detail: "Database seed script",
    documentation: `## \`seed\`
Declares a seed function run via \`vasp db seed\`.

\`\`\`vasp
seed main { fn: import { seedDatabase } from "@src/seed.ts" }
\`\`\``,
  },

  admin: {
    detail: "Vue admin panel (standalone Vite app)",
    documentation: `## \`admin\`
Generates a standalone Vue 3 + PrimeVue 4 admin panel for listed entities.

\`\`\`vasp
admin AdminPanel { entities: [Todo, User] }
\`\`\``,
  },

  storage: {
    detail: "File storage configuration",
    documentation: `## \`storage\`
Configures a file storage provider for file uploads.

**Providers:** \`local\`, \`s3\`, \`r2\`, \`gcs\`

\`\`\`vasp
storage uploads {
  provider: local
  maxSize: "10mb"
  allowedTypes: ["image/jpeg", "image/png"]
  publicPath: "/uploads"
}
\`\`\``,
  },

  email: {
    detail: "Email provider configuration",
    documentation: `## \`email\`
Configures an email provider and registers named template functions.

**Providers:** \`resend\`, \`sendgrid\`, \`smtp\`

\`\`\`vasp
email notifications {
  provider: resend
  from: "noreply@example.com"
  templates: [{ name: welcome fn: import { welcomeEmail } from "@src/emails/welcome.ts" }]
}
\`\`\``,
  },

  cache: {
    detail: "Cache store configuration",
    documentation: `## \`cache\`
Configures a cache store for query caching.

**Providers:** \`memory\`, \`redis\`, \`valkey\`

\`\`\`vasp
cache apiCache {
  provider: redis
  ttl: 60
  redis: { url: REDIS_URL }
}
\`\`\``,
  },

  webhook: {
    detail: "Inbound or outbound webhook",
    documentation: `## \`webhook\`
Declares an inbound webhook receiver or outbound event dispatcher.

**Modes:** \`inbound\`, \`outbound\`

\`\`\`vasp
webhook stripeEvents {
  mode: inbound
  path: "/webhooks/stripe"
  fn: import { handleStripeEvent } from "@src/webhooks/stripe.ts"
  verifyWith: stripe-signature
  secret: STRIPE_WEBHOOK_SECRET
}
\`\`\``,
  },

  observability: {
    detail: "OpenTelemetry tracing, metrics, and error tracking",
    documentation: `## \`observability\`
Configures OpenTelemetry tracing, Prometheus/OTLP metrics, structured logging, and error tracking.

\`\`\`vasp
observability ops {
  tracing: true
  metrics: true
  logs: structured
  exporter: otlp
  errorTracking: sentry
}
\`\`\``,
  },

  autoPage: {
    detail: "Auto-generated PrimeVue 4 list/form/detail page",
    documentation: `## \`autoPage\`
Generates a fully functional PrimeVue 4 page (list, form, or detail view) from entity metadata.

**pageType:** \`list\` | \`form\` | \`detail\`

\`\`\`vasp
autoPage TodoList {
  entity: Todo
  pageType: list
  title: "My Todos"
}
\`\`\``,
  },

  // ── Sub-block keywords ──────────────────────────────────────────────────────

  list: {
    detail: "CRUD list configuration sub-block",
    documentation: `## \`list {}\`
Configures the CRUD list endpoint and admin table view.

**Properties:** \`paginate\`, \`sortable\`, \`filterable\`, \`search\`

**Sub-blocks:** \`columns {}\`

\`\`\`vasp
list {
  paginate: true
  sortable: [title, createdAt]
  filterable: [done]
  search: [title]
}
\`\`\``,
  },

  columns: {
    detail: "Column display configuration for list views",
    documentation: `## \`columns {}\`
Configures per-column display properties in the admin table and autoPage list view.

\`\`\`vasp
columns {
  title { label: "Task" width: "40%" sortable: true }
  done  { label: "Done" width: "80px" }
}
\`\`\``,
  },

  form: {
    detail: "CRUD form layout configuration sub-block",
    documentation: `## \`form {}\`
Configures the create/edit form layout.

**layout:** \`"1-column"\` | \`"2-column"\` | \`"tabs"\` | \`"steps"\`

**Sub-blocks:** \`sections {}\` (for tabs), \`steps {}\` (for wizard)

\`\`\`vasp
form {
  layout: "2-column"
  sections {
    basics { label: "Basic Info" fields: [title, priority] }
    status { label: "Status" fields: [done] }
  }
}
\`\`\``,
  },

  sections: {
    detail: "Named form sections for tabs layout",
    documentation: `## \`sections {}\`
Declares named sections for a \`tabs\` form layout.

\`\`\`vasp
sections {
  basics { label: "Basic Info" fields: [title] }
  settings { label: "Settings" fields: [done] }
}
\`\`\``,
  },

  steps: {
    detail: "Named steps for wizard-style form layout",
    documentation: `## \`steps {}\`
Declares named steps for a \`steps\` (wizard) form layout.

\`\`\`vasp
steps {
  step1 { label: "Details" fields: [title] }
  step2 { label: "Settings" fields: [done] }
}
\`\`\``,
  },

  permissions: {
    detail: "CRUD operation permission roles",
    documentation: `## \`permissions {}\`
Restricts which roles can perform each CRUD operation.

\`\`\`vasp
permissions {
  list:   [admin, user]
  create: [admin, user]
  update: [admin]
  delete: [admin]
}
\`\`\``,
  },

  validate: {
    detail: "Field validation rules block",
    documentation: `## \`validate {}\`
Declares validation rules for a field. Generates Valibot schemas.

**Rules:** \`required\`, \`minLength\`, \`maxLength\`, \`min\`, \`max\`, \`pattern\`, \`custom\`

\`\`\`vasp
title: String {
  validate {
    required: true
    minLength: 3
    maxLength: 120
  }
}
\`\`\``,
  },

  // ── Executors ───────────────────────────────────────────────────────────────

  PgBoss: {
    detail: "PostgreSQL-backed job queue (no extra infra required)",
    documentation: `## \`PgBoss\`
Uses your existing PostgreSQL database as a job queue. No extra Redis or messaging infra required. Ideal for simple background tasks and scheduled jobs.`,
  },

  BullMQ: {
    detail: "Redis-backed job queue with advanced features",
    documentation: `## \`BullMQ\`
Redis-backed job queue. Supports concurrency, priority, delayed jobs, and rate limiting. Requires \`REDIS_URL\` env var.`,
  },

  RedisStreams: {
    detail: "Redis Streams-backed job queue",
    documentation: `## \`RedisStreams\`
Uses Redis Streams as a message queue. Lightweight alternative to BullMQ. Requires \`REDIS_URL\` env var.`,
  },

  RabbitMQ: {
    detail: "AMQP/RabbitMQ message queue",
    documentation: `## \`RabbitMQ\`
Uses RabbitMQ (AMQP) as a message broker. Ideal for enterprise pub/sub patterns. Requires \`RABBITMQ_URL\` env var.`,
  },

  Kafka: {
    detail: "Apache Kafka event streaming",
    documentation: `## \`Kafka\`
Uses Apache Kafka for high-throughput event streaming. Requires \`KAFKA_BROKERS\` env var.`,
  },

  // ── Field types ─────────────────────────────────────────────────────────────

  String: {
    detail: "Short text — VARCHAR(255) in the database",
    documentation: `## \`String\`
Maps to \`varchar(255)\` in PostgreSQL. Use for short text values like names, slugs, or emails.`,
  },

  Int: {
    detail: "32-bit integer",
    documentation: `## \`Int\`
Maps to \`integer\` in PostgreSQL. Use for counts, IDs (with \`@id\`), and foreign keys.`,
  },

  Boolean: {
    detail: "True/false value",
    documentation: `## \`Boolean\`
Maps to \`boolean\` in PostgreSQL.`,
  },

  DateTime: {
    detail: "Timestamp with timezone",
    documentation: `## \`DateTime\`
Maps to \`timestamp\` in PostgreSQL. Use \`@default(now)\` for auto-set timestamps and \`@updatedAt\` for auto-update.`,
  },

  Float: {
    detail: "64-bit floating-point number",
    documentation: `## \`Float\`
Maps to \`real\` in PostgreSQL. Use for decimal values like prices or scores.`,
  },

  Text: {
    detail: "Long text — TEXT in the database",
    documentation: `## \`Text\`
Maps to \`text\` in PostgreSQL (unlimited length). Use for descriptions, blog posts, or any long-form content.`,
  },

  Json: {
    detail: "Arbitrary JSON data",
    documentation: `## \`Json\`
Maps to \`jsonb\` in PostgreSQL. TypeScript type is \`unknown\`. Use for flexible metadata or nested objects.`,
  },

  Enum: {
    detail: "Enumerated string values — Enum(val1, val2, ...)",
    documentation: `## \`Enum(val1, val2, ...)\`
Maps to a PostgreSQL enum type. Values are declared inline.

\`\`\`vasp
status: Enum(active, inactive, archived)
priority: Enum(low, medium, high)
\`\`\``,
  },

  File: {
    detail: "File upload field (requires @storage(StorageName))",
    documentation: `## \`File\`
Stores the file URL/path in the database. Must have \`@storage(StorageName)\` modifier referencing a declared \`storage\` block.

\`\`\`vasp
avatar: File @storage(uploads)
\`\`\``,
  },

  // ── Modifiers ───────────────────────────────────────────────────────────────

  "@id": {
    detail: "Primary key field",
    documentation: `## \`@id\`
Marks this field as the primary key. Typically used with \`Int\` for auto-increment IDs.`,
  },

  "@unique": {
    detail: "Unique constraint",
    documentation: `## \`@unique\`
Adds a UNIQUE constraint to this column.`,
  },

  "@nullable": {
    detail: "Allow NULL values in this column",
    documentation: `## \`@nullable\`
Makes the column nullable (NULL allowed). The TypeScript type becomes \`T | null\`.`,
  },

  "@default": {
    detail: "@default(value) — column default value",
    documentation: `## \`@default(value)\`
Sets a default value. Use \`@default(now)\` for \`CURRENT_TIMESTAMP\`.`,
  },

  "@updatedAt": {
    detail: "Auto-update timestamp on every row update",
    documentation: `## \`@updatedAt\`
Automatically updates this field to the current timestamp whenever the row is updated. Only valid on \`DateTime\` fields.`,
  },

  "@manyToMany": {
    detail: "Many-to-many relation (generates junction table)",
    documentation: `## \`@manyToMany\`
Creates an implicit junction table between two entities.`,
  },

  "@hidden": {
    detail: "Exclude this field from all API responses",
    documentation: `## \`@hidden\`
Marks a field as sensitive so it is never included in API responses (register, login, /me, etc.).

Useful for server-only fields like \`stripeCustomerId\`, \`internalScore\`, or \`secretToken\`:

\`\`\`vasp
entity User {
  id:               Int    @id
  username:         String @unique
  stripeCustomerId: String @hidden
  internalScore:    Int    @hidden
}
\`\`\``,
  },

  "@storage": {
    detail: "@storage(StorageName) — link a File field to a storage block",
    documentation: `## \`@storage(StorageName)\`
Links a \`File\` field to a declared \`storage\` block. Required for all File fields.`,
  },

  "@onDelete": {
    detail: "@onDelete(cascade|restrict|setNull) — FK delete behavior",
    documentation: `## \`@onDelete(behavior)\`
Sets the ON DELETE behavior for this foreign key.

- **cascade** — delete child rows when parent is deleted
- **restrict** — prevent parent deletion if children exist
- **setNull** — set this FK column to NULL when parent is deleted`,
  },

  "@validate": {
    detail: "@validate(...) — inline field validation constraints",
    documentation: `## \`@validate(...)\`
Inline validation constraints for a field. Generates Valibot rules.

\`\`\`vasp
email: String @validate(email)
age: Int @validate(min: 18, max: 120)
name: String @validate(minLength: 2, maxLength: 50)
\`\`\``,
  },
};

/** Get documentation for a keyword, falling back gracefully */
export function getDoc(keyword: string): VaspDocEntry | null {
  return VASP_DOCS[keyword] ?? null;
}
