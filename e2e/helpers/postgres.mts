/**
 * Docker-managed Postgres helpers for the fullstack E2E suite.
 *
 * Spins up a postgres:16-alpine container with a random host port,
 * waits until the DB is ready, then creates/drops isolated databases
 * for each test run.  All interaction is via synchronous child_process
 * calls so this can be used from Playwright's globalSetup (.mts files).
 */

import { spawnSync } from 'node:child_process'

export const PG_IMAGE = 'postgres:16-alpine'
export const PG_USER = 'vasptest'
export const PG_PASS = 'vasptest'

export interface PostgresHandle {
  containerId: string
  port: number
}

/** Start a fresh Postgres container and return its container ID + host port. */
export function startPostgresContainer(port: number): PostgresHandle {
  const name = `vasp-e2e-pg-${Date.now()}`
  const result = spawnSync(
    'docker',
    [
      'run', '-d',
      '--name', name,
      '-e', `POSTGRES_USER=${PG_USER}`,
      '-e', `POSTGRES_PASSWORD=${PG_PASS}`,
      '-e', 'POSTGRES_DB=postgres',
      '-p', `${port}:5432`,
      PG_IMAGE,
    ],
    { encoding: 'utf8', timeout: 30_000 },
  )
  if (result.status !== 0) {
    throw new Error(`Failed to start Postgres container:\n${result.stderr}`)
  }
  return { containerId: result.stdout.trim(), port }
}

/** Poll pg_isready inside the container until ready (or throw on timeout). */
export function waitForPostgres(handle: PostgresHandle, timeoutMs = 30_000): void {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const check = spawnSync(
      'docker',
      ['exec', handle.containerId, 'pg_isready', '-U', PG_USER, '-d', 'postgres'],
      { encoding: 'utf8', timeout: 5_000 },
    )
    if (check.status === 0) return
    // Synchronous sleep — Atomics.wait on a SharedArrayBuffer avoids spawning
    // an external process and works cross-platform.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500)
  }
  throw new Error(`Postgres did not become ready within ${timeoutMs}ms`)
}

/** Create a new database inside the running container and return its connection URL. */
export function createDatabase(handle: PostgresHandle, dbName: string): string {
  const result = spawnSync(
    'docker',
    ['exec', handle.containerId, 'psql', '-U', PG_USER, '-d', 'postgres', '-c', `CREATE DATABASE "${dbName}";`],
    { encoding: 'utf8', timeout: 15_000 },
  )
  if (result.status !== 0) {
    throw new Error(`Failed to create database "${dbName}":\n${result.stderr}`)
  }
  return buildConnectionUrl(handle, dbName)
}

/** Drop a database (silently skips if it doesn't exist). */
export function dropDatabase(handle: PostgresHandle, dbName: string): void {
  spawnSync(
    'docker',
    ['exec', handle.containerId, 'psql', '-U', PG_USER, '-d', 'postgres', '-c', `DROP DATABASE IF EXISTS "${dbName}";`],
    { encoding: 'utf8', timeout: 15_000 },
  )
}

/** Stop and remove the Postgres container. */
export function stopPostgresContainer(containerId: string): void {
  spawnSync('docker', ['rm', '-f', containerId], { encoding: 'utf8', timeout: 15_000 })
}

/** Build a postgres:// connection URL for the given database. */
export function buildConnectionUrl(handle: PostgresHandle, dbName: string): string {
  return `postgres://${PG_USER}:${PG_PASS}@localhost:${handle.port}/${dbName}`
}
