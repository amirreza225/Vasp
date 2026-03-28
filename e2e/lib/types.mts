/**
 * Shared TypeScript interfaces for the Vasp E2E suite architecture.
 *
 * Every fixture suite uses FixtureHarness to manage lifecycle; these
 * types are the shared vocabulary across setup, teardown, and test files.
 */

// ── Docker container handles ──────────────────────────────────────────────────

export interface DockerHandle {
  containerId: string
  port: number
}

export interface RabbitHandle {
  containerId: string
  amqpPort: number
  managementPort: number
}

export interface MinIOHandle {
  containerId: string
  apiPort: number
  consolePort: number
  /** Bucket created by setup for this suite's tests. */
  bucket: string
}

export interface MailpitHandle {
  containerId: string
  smtpPort: number
  webPort: number
  /** HTTP base URL for the Mailpit API, e.g. http://localhost:28080 */
  webUrl: string
}

// ── Fixture capability profile ────────────────────────────────────────────────

/**
 * Describes everything the parser detected in a .vasp fixture file.
 * Capabilities drive which assertions are applied and which services
 * the FixtureHarness needs to start.
 */
export interface FixtureCapabilities {
  // DSL block presence
  hasAuth: boolean
  hasCrud: boolean
  hasRealtime: boolean
  hasJobs: boolean
  hasJobsPgBoss: boolean
  hasJobsBullMQ: boolean
  hasJobsRedisStreams: boolean
  hasJobsRabbitMQ: boolean
  hasJobsKafka: boolean
  hasStorage: boolean
  hasStorageS3: boolean
  hasStorageR2: boolean
  hasStorageGcs: boolean
  hasStorageLocal: boolean
  hasEmail: boolean
  hasEmailResend: boolean
  hasEmailSendgrid: boolean
  hasEmailSmtp: boolean
  hasCache: boolean
  hasCacheRedis: boolean
  hasCacheValkey: boolean
  hasAdmin: boolean
  hasMultiTenant: boolean
  hasAutoPages: boolean
  hasWebhooks: boolean
  hasInboundWebhooks: boolean
  hasOutboundWebhooks: boolean
  hasObservability: boolean
  hasSeed: boolean
  hasMiddleware: boolean
  hasApi: boolean

  // App mode
  isTypeScript: boolean
  isSsr: boolean
  isSsg: boolean

  // Extracted names (kebab-case for route matching)
  entityNames: string[]
  crudEntityNames: string[]
  queryNames: string[]
  actionNames: string[]
  jobNames: string[]
  channelNames: string[]
  apiPaths: string[]
  autoPagePaths: string[]

  // Auth details
  authMethods: string[]
  hasRoles: boolean
  hasPermissions: boolean

  // Infra requirements
  needsRedis: boolean
  needsRabbitMQ: boolean
  needsKafka: boolean
  needsMinIO: boolean
  needsMailpit: boolean
}

// ── Generation result ─────────────────────────────────────────────────────────

export interface GenerationResult {
  /** Exit code of `vasp new` */
  exitCode: number | null
  stdout: string
  stderr: string
  /** Semantic error codes found in vasp new output (E1xx) */
  semanticErrors: string[]
  /** Handlebars template errors in vasp new output */
  templateErrors: string[]
  /** Exit code of `vasp generate --force` */
  regenExitCode?: number | null
  regenSemanticErrors?: string[]
  regenTemplateErrors?: string[]
  /** Total wall-clock time for the generation phase (ms) */
  durationMs?: number
}

// ── Service handles (what's alive during a test run) ─────────────────────────

export interface ServiceHandles {
  pg: DockerHandle
  redis?: DockerHandle
  rabbit?: RabbitHandle
  kafka?: DockerHandle
  minio?: MinIOHandle
  mailpit?: MailpitHandle
}

// ── Per-fixture runtime state (persisted to JSON) ─────────────────────────────

/**
 * Written by FixtureHarness.setup() and read by test workers via the
 * deterministic state-file path  e2e/__e2e_state_{name}__.json .
 */
export interface FixtureState {
  /** Fixture identifier, e.g. "minimal" */
  name: string
  appDir: string
  logDir: string
  stateFile: string
  backendUrl: string
  frontendUrl: string | null
  magicToken: string
  dbUrl: string
  backendPid: number | null
  frontendPid: number | null
  services: ServiceHandles
  generation: GenerationResult
  capabilities: FixtureCapabilities
  /** Any data seeded directly into the DB (e.g. tenant workspaces). */
  seedData: Record<string, unknown>
  errors: string[]
}

// ── Fixture configuration (passed to FixtureHarness constructor) ──────────────

export interface FixtureConfig {
  /** Short identifier used in state-file names and env-var prefixes. */
  name: string
  /** Absolute path to the .vasp fixture file. */
  fixturePath: string
  /** Host port the generated Elysia backend listens on. */
  backendPort: number
  /**
   * Host port for the Vite/Nuxt dev server.
   * null = do not start a frontend process.
   */
  frontendPort: number | null
  /** Host port for the per-fixture Docker Postgres container. */
  pgPort: number

  // Optional ports for additional Docker services
  redisPort?: number
  rabbitAmqpPort?: number
  rabbitManagementPort?: number
  kafkaPort?: number
  minioApiPort?: number
  minioConsolePort?: number
  mailpitSmtpPort?: number
  mailpitWebPort?: number

  /** Whether to start a frontend process in addition to the backend. */
  startFrontend?: boolean
  /** 'vite' for SPA (default), 'nuxt' for SSR. */
  frontendType?: 'vite' | 'nuxt'

  /**
   * Whether to seed a Workspace row directly into the DB before starting
   * the backend (required for multi-tenant fixtures where the User entity
   * references a Workspace via a non-nullable FK).
   */
  seedWorkspace?: boolean

  /**
   * Override the column list and values for the workspace seed INSERT.
   * Defaults to `(name) VALUES ('workspace-alpha')` and `(name) VALUES ('workspace-beta')`.
   * For fixtures with more required workspace fields, provide custom SQL fragments.
   * Example: `{ columns: 'slug, name, "isActive"', alphaValues: "'alpha', 'Alpha', true", betaValues: "'beta', 'Beta', true" }`
   */
  workspaceSeed?: {
    columns: string
    alphaValues: string
    betaValues: string
    alphaTaskValues?: string  // SQL for task creation in workspace alpha
    betaTaskValues?: string   // SQL for task creation in workspace beta
  }

  /** Extra env vars merged into the generated app's .env at setup time. */
  extraEnv?: Record<string, string>
}
