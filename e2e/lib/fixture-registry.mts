/**
 * Fixture registry — declares the configuration for every E2E fixture suite.
 *
 * Also provides parseCapabilities(), which scans a .vasp file with simple
 * regex patterns and returns a FixtureCapabilities object that drives
 * which services are started and which assertion suites are applied.
 */

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FixtureCapabilities, FixtureConfig } from './types.mts'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const MONOREPO_ROOT = resolve(__dirname, '..', '..')
const FIXTURES_DIR = join(MONOREPO_ROOT, 'e2e', 'fixtures')

// ── Port allocation (static, no collisions for sequential or parallel runs) ───
//
//  Fixture        Backend  Frontend  PG-host   Redis   Rabbit-AMQP  Kafka   MinIO-API  Mailpit-SMTP
//  minimal          3101     5201     25101      —        —          —          —           —
//  todo-app         3102     5202     25102      —        —          —          —           —
//  e2e-todo         3103     5203     25103      —        —          —          —           —
//  multi-tenant     3104     5204     25104      —        —          —          —           —
//  full-featured    3105     5205     25105    26380     25674     29093       —           —
//  project-hub      3106     5206     25106    26381     25676     29094     29000       28025

// ── Capability parser ─────────────────────────────────────────────────────────

function names(source: string, block: string): string[] {
  const re = new RegExp(`^${block}\\s+(\\w+)\\s*\\{`, 'gm')
  return [...source.matchAll(re)].map((m) => m[1])
}

function crudEntityNames(source: string): string[] {
  const re = /^crud\s+\w+\s*\{[^}]*entity:\s*(\w+)/gms
  return [...source.matchAll(re)].map((m) => m[1])
}

function authMethods(source: string): string[] {
  const match = source.match(/methods:\s*\[([^\]]+)\]/)
  if (!match) return []
  return match[1].split(',').map((s) => s.trim())
}

function extractApiPaths(source: string): string[] {
  const re = /^api\s+\w+\s*\{[^}]*path:\s*"([^"]+)"/gms
  return [...source.matchAll(re)].map((m) => m[1])
}

function extractAutoPagePaths(source: string): string[] {
  const re = /^autoPage\s+\w+\s*\{[^}]*path:\s*"([^"]+)"/gms
  return [...source.matchAll(re)].map((m) => m[1])
}

/**
 * Parse a .vasp file and return a FixtureCapabilities object that describes
 * every DSL block type present and the infra services required.
 */
export function parseCapabilities(fixturePath: string): FixtureCapabilities {
  const src = readFileSync(fixturePath, 'utf8')

  const hasJobsPgBoss = /executor:\s*PgBoss/m.test(src)
  const hasJobsBullMQ = /executor:\s*BullMQ/m.test(src)
  const hasJobsRedisStreams = /executor:\s*RedisStreams/m.test(src)
  const hasJobsRabbitMQ = /executor:\s*RabbitMQ/m.test(src)
  const hasJobsKafka = /executor:\s*Kafka/m.test(src)

  const hasStorageS3 = /provider:\s*s3/im.test(src)
  const hasStorageR2 = /provider:\s*r2/im.test(src)
  const hasStorageGcs = /provider:\s*gcs/im.test(src)
  const hasStorageLocal = /provider:\s*local/im.test(src)
  const hasStorage = hasStorageS3 || hasStorageR2 || hasStorageGcs || hasStorageLocal

  const hasEmailResend = /provider:\s*resend/im.test(src)
  const hasEmailSendgrid = /provider:\s*sendgrid/im.test(src)
  const hasEmailSmtp = /provider:\s*smtp/im.test(src)
  const hasEmail = hasEmailResend || hasEmailSendgrid || hasEmailSmtp

  const hasCacheRedis = /provider:\s*redis/im.test(src) && /^cache\s+/m.test(src)
  const hasCacheValkey = /provider:\s*valkey/im.test(src)
  const hasCache = /^cache\s+\w+\s*\{/m.test(src)

  const hasJobs = hasJobsPgBoss || hasJobsBullMQ || hasJobsRedisStreams || hasJobsRabbitMQ || hasJobsKafka
  const needsRedis = hasJobsBullMQ || hasJobsRedisStreams || hasCacheRedis || hasCacheValkey
  const needsRabbitMQ = hasJobsRabbitMQ
  const needsKafka = hasJobsKafka
  const needsMinIO = hasStorageS3 || hasStorageR2
  const needsMailpit = hasEmailSmtp // Mailpit needs SMTP provider in the fixture

  return {
    hasAuth: /^auth\s+\w+\s*\{/m.test(src),
    hasCrud: /^crud\s+\w+\s*\{/m.test(src),
    hasRealtime: /^realtime\s+\w+\s*\{/m.test(src),
    hasJobs,
    hasJobsPgBoss,
    hasJobsBullMQ,
    hasJobsRedisStreams,
    hasJobsRabbitMQ,
    hasJobsKafka,
    hasStorage,
    hasStorageS3,
    hasStorageR2,
    hasStorageGcs,
    hasStorageLocal,
    hasEmail,
    hasEmailResend,
    hasEmailSendgrid,
    hasEmailSmtp,
    hasCache,
    hasCacheRedis,
    hasCacheValkey,
    hasAdmin: /^admin\s*\{/m.test(src),
    hasMultiTenant: /multiTenant:\s*\{/m.test(src),
    hasAutoPages: /^autoPage\s+\w+\s*\{/m.test(src),
    hasWebhooks: /^webhook\s+\w+\s*\{/m.test(src),
    hasInboundWebhooks: /^webhook\s+\w+\s*\{[^}]*fn:/ms.test(src),
    hasOutboundWebhooks: /^webhook\s+\w+\s*\{[^}]*entity:/ms.test(src),
    hasObservability: /^observability\s*\{/m.test(src),
    hasSeed: /^seed\s*\{/m.test(src),
    hasMiddleware: /^middleware\s+\w+\s*\{/m.test(src),
    hasApi: /^api\s+\w+\s*\{/m.test(src),
    isTypeScript: /typescript:\s*true/m.test(src),
    isSsr: /ssr:\s*true/m.test(src),
    isSsg: /ssr:\s*"ssg"/m.test(src),
    entityNames: names(src, 'entity'),
    crudEntityNames: crudEntityNames(src),
    queryNames: names(src, 'query'),
    actionNames: names(src, 'action'),
    jobNames: names(src, 'job'),
    channelNames: names(src, 'realtime'),
    apiPaths: extractApiPaths(src),
    autoPagePaths: extractAutoPagePaths(src),
    authMethods: authMethods(src),
    hasRoles: /^auth\s+\w+\s*\{[^}]*roles:\s*\[/ms.test(src),
    hasPermissions: /^auth\s+\w+\s*\{[^}]*permissions:\s*\{/ms.test(src),
    needsRedis,
    needsRabbitMQ,
    needsKafka,
    needsMinIO,
    needsMailpit,
  }
}

// ── Placeholder values replaced at runtime by FixtureHarness ─────────────────
export const MINIO_ROOT_USER_PLACEHOLDER = '__MINIO_USER__'
export const MINIO_ROOT_PASS_PLACEHOLDER = '__MINIO_PASS__'

// ── Fixture registry ──────────────────────────────────────────────────────────

/**
 * Canonical configuration for every fixture suite.
 * Each entry is passed directly to `new FixtureHarness(FIXTURES.xxx)`.
 */
export const FIXTURES: Record<string, FixtureConfig> = {
  minimal: {
    name: 'minimal',
    fixturePath: join(FIXTURES_DIR, 'minimal.vasp'),
    backendPort: 3101,
    frontendPort: 5201,
    pgPort: 25101,
    startFrontend: true,
    frontendType: 'vite',
  },

  'todo-app': {
    name: 'todo-app',
    fixturePath: join(FIXTURES_DIR, 'todo-app.vasp'),
    backendPort: 3102,
    frontendPort: 5202,
    pgPort: 25102,
    startFrontend: true,
    frontendType: 'vite',
  },

  'e2e-todo': {
    name: 'e2e-todo',
    fixturePath: join(FIXTURES_DIR, 'e2e-todo.vasp'),
    backendPort: 3103,
    frontendPort: 5203,
    pgPort: 25103,
    startFrontend: true,
    frontendType: 'vite',
  },

  'multi-tenant': {
    name: 'multi-tenant',
    fixturePath: join(FIXTURES_DIR, 'multi-tenant.vasp'),
    backendPort: 3104,
    frontendPort: 5204,
    pgPort: 25104,
    startFrontend: true,
    frontendType: 'vite',
    seedWorkspace: true,
  },

  'full-featured': {
    name: 'full-featured',
    fixturePath: join(FIXTURES_DIR, 'full-featured.vasp'),
    backendPort: 3105,
    frontendPort: 5205,
    pgPort: 25105,
    startFrontend: true,
    frontendType: 'nuxt',
    // Redis for BullMQ + RedisStreams + cache
    redisPort: 26380,
    // RabbitMQ for notifyPartner job
    rabbitAmqpPort: 25674,
    rabbitManagementPort: 25675,
    // Kafka for indexSearchDocs job
    kafkaPort: 29093,
    extraEnv: {
      REDIS_URL: 'redis://localhost:26380',
      RABBITMQ_URL: 'amqp://guest:guest@localhost:25674',
      KAFKA_BROKERS: 'localhost:29093',
      // Stub OAuth so the server starts without real credentials
      GOOGLE_CLIENT_ID: 'stub-google-client-id',
      GOOGLE_CLIENT_SECRET: 'stub-google-client-secret',
      GITHUB_CLIENT_ID: 'stub-github-client-id',
      GITHUB_CLIENT_SECRET: 'stub-github-client-secret',
      // Stub webhook secrets
      STRIPE_WEBHOOK_SECRET: 'stub-stripe-secret',
      WEBHOOK_URLS: 'http://localhost:9999/stub',
      WEBHOOK_SECRET: 'stub-webhook-secret',
    },
  },

  'project-hub': {
    name: 'project-hub',
    fixturePath: join(FIXTURES_DIR, 'project-hub.vasp'),
    backendPort: 3106,
    frontendPort: 5206,
    pgPort: 25106,
    startFrontend: true,
    frontendType: 'nuxt',
    seedWorkspace: true,
    // Custom seed for Workspace (has required slug, name, isActive fields)
    workspaceSeed: {
      columns: 'slug, name, plan, "isActive"',
      alphaValues: `'workspace-alpha', 'Workspace Alpha', 'free', true`,
      betaValues: `'workspace-beta', 'Workspace Beta', 'free', true`,
      alphaTaskValues: `'Alpha Task 1', 'todo', 'medium', false`,
      betaTaskValues: `'Beta Task 1', 'todo', 'low', false`,
      // Seed the E2E magic user (id=0) so that ownership-filtered CRUD endpoints
      // accept the magic token's synthetic user and FK constraints pass.
      // role is inserted as a plain string — Postgres casts it to the pgEnum type.
      magicUserColumns: `id, username, email, role, "isActive", "workspaceId", created_at, updated_at`,
      magicUserValues: (wsId) =>
        `0, 'e2e-admin', 'e2e@vasp.test', 'admin', true, ${wsId}, NOW(), NOW()`,
    },
    // Full infra: Redis, RabbitMQ, Kafka, MinIO, Mailpit
    redisPort: 26381,
    rabbitAmqpPort: 25676,
    rabbitManagementPort: 25677,
    kafkaPort: 29094,
    minioApiPort: 29000,
    minioConsolePort: 29001,
    mailpitSmtpPort: 28025,
    mailpitWebPort: 28080,
    extraEnv: {
      REDIS_URL: 'redis://localhost:26381',
      RABBITMQ_URL: 'amqp://guest:guest@localhost:25676',
      KAFKA_BROKERS: 'localhost:29094',
      // MinIO as S3-compatible endpoint
      S3_BUCKET: 'vaspe2e',
      S3_REGION: 'us-east-1',
      S3_ENDPOINT: 'http://localhost:29000',
      AWS_ACCESS_KEY_ID: MINIO_ROOT_USER_PLACEHOLDER,
      AWS_SECRET_ACCESS_KEY: MINIO_ROOT_PASS_PLACEHOLDER,
      // Mailpit SMTP
      SMTP_HOST: 'localhost',
      SMTP_PORT: '28025',
      FROM_EMAIL: 'no-reply@projecthub-test.io',
      // Stub Resend API key (email provider is resend in fixture, SMTP via Mailpit for tests)
      RESEND_API_KEY: 'stub-resend-key',
      // Stub OAuth
      GOOGLE_CLIENT_ID: 'stub-google-client-id',
      GOOGLE_CLIENT_SECRET: 'stub-google-client-secret',
      GITHUB_CLIENT_ID: 'stub-github-client-id',
      GITHUB_CLIENT_SECRET: 'stub-github-client-secret',
      // Stub webhook + observability secrets
      GITHUB_WEBHOOK_SECRET: 'stub-github-webhook-secret',
      STRIPE_WEBHOOK_SECRET: 'stub-stripe-webhook-secret',
      WEBHOOK_SIGNING_SECRET: 'stub-webhook-signing-secret',
      SENTRY_DSN: '',
      LOG_LEVEL: 'warn',
      // project-hub env block only allows Enum(development, staging, production) — not 'test'
      NODE_ENV: 'development',
    },
  },
}
