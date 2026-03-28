/**
 * Docker container helpers for optional E2E services:
 * Redis, RabbitMQ, Kafka (KRaft), MinIO, and Mailpit.
 *
 * Each helper follows the same pattern as the existing postgres helper:
 *   – start{Service}Container(port...) → handle
 *   – waitFor{Service}(handle)         → void
 * Teardown reuses the existing stopPostgresContainer() naming pattern
 * (`docker rm -f <containerId>`).
 */

import { spawnSync } from 'node:child_process'
import type { DockerHandle, RabbitHandle, MinIOHandle, MailpitHandle } from './types.mts'

// ── constants ─────────────────────────────────────────────────────────────────

const REDIS_IMAGE = 'redis:7-alpine'
const RABBITMQ_IMAGE = 'rabbitmq:3.13-management-alpine'
const KAFKA_IMAGE = 'apache/kafka:3.7.0'
const MINIO_IMAGE = 'minio/minio:RELEASE.2024-07-13T01-52-12Z'
const MAILPIT_IMAGE = 'axllent/mailpit:v1.18'

const MINIO_ROOT_USER = 'vaspe2euser'
const MINIO_ROOT_PASS = 'vaspe2epass'

/** Synchronous sleep without spawning a process. */
function sleepMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/** Run `docker` synchronously; throw on non-zero exit. */
function dockerSync(args: string[], label: string, timeoutMs = 30_000): string {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: timeoutMs })
  if (result.status !== 0) {
    throw new Error(`${label} failed:\nSTDOUT: ${result.stdout}\nSTDERR: ${result.stderr}`)
  }
  return result.stdout.trim()
}

/** Run `docker` synchronously; return stdout (don't throw on failure). */
function dockerSyncSilent(args: string[], timeoutMs = 10_000): { status: number; stdout: string } {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: timeoutMs })
  return { status: result.status ?? 1, stdout: result.stdout?.trim() ?? '' }
}

// ── Redis ─────────────────────────────────────────────────────────────────────

/**
 * Start a Redis container on `port` and return a handle.
 * Waits up to 20 seconds for Redis to accept connections.
 */
export function startRedisContainer(port: number): DockerHandle {
  const name = `vasp-e2e-redis-${port}`
  const containerId = dockerSync(
    ['run', '-d', '--name', name, '-p', `${port}:6379`, REDIS_IMAGE],
    'start Redis container',
  )
  return { containerId, port }
}

/** Wait until Redis accepts a PING. */
export function waitForRedis(handle: DockerHandle, timeoutMs = 20_000): void {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const res = dockerSyncSilent(['exec', handle.containerId, 'redis-cli', 'ping'])
    if (res.status === 0 && res.stdout.includes('PONG')) return
    sleepMs(500)
  }
  throw new Error(`Redis on port ${handle.port} did not become ready within ${timeoutMs}ms`)
}

// ── RabbitMQ ──────────────────────────────────────────────────────────────────

/**
 * Start a RabbitMQ container with the management plugin.
 */
export function startRabbitMQContainer(amqpPort: number, managementPort: number): RabbitHandle {
  const name = `vasp-e2e-rabbit-${amqpPort}`
  const containerId = dockerSync(
    [
      'run',
      '-d',
      '--name',
      name,
      '-e',
      'RABBITMQ_DEFAULT_USER=guest',
      '-e',
      'RABBITMQ_DEFAULT_PASS=guest',
      '-p',
      `${amqpPort}:5672`,
      '-p',
      `${managementPort}:15672`,
      RABBITMQ_IMAGE,
    ],
    'start RabbitMQ container',
  )
  return { containerId, amqpPort, managementPort }
}

/** Wait until RabbitMQ's management HTTP API returns 200. */
export async function waitForRabbitMQ(handle: RabbitHandle, timeoutMs = 60_000): Promise<void> {
  const url = `http://localhost:${handle.managementPort}/api/overview`
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: 'Basic ' + Buffer.from('guest:guest').toString('base64') },
      })
      if (res.ok) return
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 1_000))
  }
  throw new Error(`RabbitMQ did not become ready within ${timeoutMs}ms`)
}

// ── Kafka (KRaft, single-broker) ──────────────────────────────────────────────

/**
 * Start a Kafka broker in KRaft mode (no ZooKeeper) using the official
 * apache/kafka image with --network host so that ADVERTISED_LISTENERS
 * pointing at localhost:<port> is reachable both from the host and from
 * inside the container (needed for the wait-for-ready probe).
 *
 * Controller listener occupies port+1 on the host network.
 */
export function startKafkaContainer(port: number): DockerHandle {
  const name = `vasp-e2e-kafka-${port}`
  const controllerPort = port + 1
  const clusterId = 'MkU3OEVBNTcwNTJENDM2Qk'
  const containerId = dockerSync(
    [
      'run',
      '-d',
      '--name',
      name,
      '--network',
      'host',
      '-e',
      'KAFKA_NODE_ID=0',
      '-e',
      'KAFKA_PROCESS_ROLES=broker,controller',
      '-e',
      `KAFKA_LISTENERS=PLAINTEXT://:${port},CONTROLLER://:${controllerPort}`,
      '-e',
      `KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://localhost:${port}`,
      '-e',
      `KAFKA_CONTROLLER_QUORUM_VOTERS=0@localhost:${controllerPort}`,
      '-e',
      'KAFKA_LISTENER_SECURITY_PROTOCOL_MAP=CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT',
      '-e',
      'KAFKA_CONTROLLER_LISTENER_NAMES=CONTROLLER',
      '-e',
      'KAFKA_INTER_BROKER_LISTENER_NAME=PLAINTEXT',
      '-e',
      'KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR=1',
      '-e',
      `KAFKA_CLUSTER_ID=${clusterId}`,
      KAFKA_IMAGE,
    ],
    'start Kafka container',
    60_000,
  )
  return { containerId, port }
}

/** Wait until Kafka's broker is reachable (polls topic list via kafka-topics.sh). */
export function waitForKafka(handle: DockerHandle, timeoutMs = 60_000): void {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const res = dockerSyncSilent(
      [
        'exec',
        handle.containerId,
        '/opt/kafka/bin/kafka-topics.sh',
        '--bootstrap-server',
        `localhost:${handle.port}`,
        '--list',
      ],
      10_000,
    )
    if (res.status === 0) return
    sleepMs(2_000)
  }
  throw new Error(`Kafka on port ${handle.port} did not become ready within ${timeoutMs}ms`)
}

// ── MinIO ─────────────────────────────────────────────────────────────────────

/**
 * Start a MinIO container (S3-compatible object store).
 * Creates the bucket `vaspe2e` after startup.
 */
export function startMinIOContainer(apiPort: number, consolePort: number): MinIOHandle {
  const name = `vasp-e2e-minio-${apiPort}`
  const bucket = 'vaspe2e'

  const containerId = dockerSync(
    [
      'run',
      '-d',
      '--name',
      name,
      '-p',
      `${apiPort}:9000`,
      '-p',
      `${consolePort}:9001`,
      '-e',
      `MINIO_ROOT_USER=${MINIO_ROOT_USER}`,
      '-e',
      `MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASS}`,
      MINIO_IMAGE,
      'server',
      '/data',
      '--console-address',
      ':9001',
    ],
    'start MinIO container',
  )

  return { containerId, apiPort, consolePort, bucket }
}

export { MINIO_ROOT_USER, MINIO_ROOT_PASS }

/** Wait until MinIO's health endpoint responds, then create the test bucket. */
export async function waitForMinIO(handle: MinIOHandle, timeoutMs = 30_000): Promise<void> {
  const url = `http://localhost:${handle.apiPort}/minio/health/live`
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) break
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500))
  }

  if (Date.now() - start >= timeoutMs) {
    throw new Error(`MinIO did not become ready within ${timeoutMs}ms`)
  }

  // Create the test bucket using the mc (MinIO Client) inside the container
  dockerSync(
    [
      'exec',
      handle.containerId,
      'mc',
      'alias',
      'set',
      'local',
      'http://localhost:9000',
      MINIO_ROOT_USER,
      MINIO_ROOT_PASS,
    ],
    'mc alias set',
  )
  dockerSync(
    ['exec', handle.containerId, 'mc', 'mb', '--ignore-existing', `local/${handle.bucket}`],
    'mc mb',
  )
}

// ── Mailpit ───────────────────────────────────────────────────────────────────

/**
 * Start a Mailpit container (SMTP catcher for E2E email tests).
 */
export function startMailpitContainer(smtpPort: number, webPort: number): MailpitHandle {
  const name = `vasp-e2e-mailpit-${smtpPort}`
  const containerId = dockerSync(
    [
      'run',
      '-d',
      '--name',
      name,
      '-p',
      `${smtpPort}:1025`,
      '-p',
      `${webPort}:8025`,
      MAILPIT_IMAGE,
    ],
    'start Mailpit container',
  )
  return {
    containerId,
    smtpPort,
    webPort,
    webUrl: `http://localhost:${webPort}`,
  }
}

/** Wait until Mailpit's API health endpoint responds. */
export async function waitForMailpit(handle: MailpitHandle, timeoutMs = 20_000): Promise<void> {
  const url = `${handle.webUrl}/api/v1/info`
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`Mailpit did not become ready within ${timeoutMs}ms`)
}

/** Get all messages from Mailpit (most recent first). */
export async function mailpitMessages(
  handle: MailpitHandle,
): Promise<{ id: string; subject: string; to: string[] }[]> {
  const res = await fetch(`${handle.webUrl}/api/v1/messages`)
  if (!res.ok) throw new Error(`Mailpit API error: ${res.status}`)
  const data = (await res.json()) as { messages?: { ID: string; Subject: string; To: { Address: string }[] }[] }
  return (data.messages ?? []).map((m) => ({
    id: m.ID,
    subject: m.Subject,
    to: m.To.map((r) => r.Address),
  }))
}

/** Delete all messages from Mailpit (clean state between tests). */
export async function mailpitClear(handle: MailpitHandle): Promise<void> {
  await fetch(`${handle.webUrl}/api/v1/messages`, { method: 'DELETE' })
}

// ── Generic container stop ────────────────────────────────────────────────────

/** Stop and remove any Docker container by ID. */
export function stopContainer(containerId: string): void {
  spawnSync('docker', ['rm', '-f', containerId], { encoding: 'utf8', timeout: 15_000 })
}
