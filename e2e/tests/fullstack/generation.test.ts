/**
 * Generation tests — verify that the Vasp CLI produced all expected files
 * from the e2e-todo.vasp fixture with no errors.
 *
 * These tests read the state JSON written by globalSetup, so they run
 * after generation is complete but before any network call is needed.
 */

import { test, expect } from '@playwright/test'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const STATE_FILE = process.env.E2E_STATE_FILE!
const APP_DIR = process.env.E2E_APP_DIR!

const state = JSON.parse(readFileSync(STATE_FILE, 'utf8'))
const generation = state.generation as {
  exitCode: number
  semanticErrors: string[]
  templateErrors: string[]
  regenExitCode?: number
  regenSemanticErrors?: string[]
}

// ── Generation exit codes ────────────────────────────────────────────────────

test('vasp new exits with code 0', () => {
  expect(generation.exitCode).toBe(0)
})

test('vasp generate --force exits with code 0', () => {
  expect(generation.regenExitCode ?? 0).toBe(0)
})

// ── Semantic errors ───────────────────────────────────────────────────────────

test('no semantic errors (E1xx) in vasp new output', () => {
  expect(generation.semanticErrors).toHaveLength(0)
})

test('no semantic errors (E1xx) in vasp generate output', () => {
  expect(generation.regenSemanticErrors ?? []).toHaveLength(0)
})

// ── Handlebars template errors ────────────────────────────────────────────────

test('no Handlebars template errors in generation output', () => {
  expect(generation.templateErrors).toHaveLength(0)
})

// ── Core file existence ───────────────────────────────────────────────────────

test('package.json is generated', () => {
  expect(existsSync(join(APP_DIR, 'package.json'))).toBe(true)
})

test('main.vasp is present', () => {
  expect(existsSync(join(APP_DIR, 'main.vasp'))).toBe(true)
})

test('drizzle schema is generated (.ts)', () => {
  expect(existsSync(join(APP_DIR, 'drizzle/schema.ts'))).toBe(true)
})

test('server entry point is generated (.ts)', () => {
  expect(existsSync(join(APP_DIR, 'server/index.ts'))).toBe(true)
})

test('database client is generated', () => {
  expect(existsSync(join(APP_DIR, 'server/db/client.ts'))).toBe(true)
})

test('auth routes are generated', () => {
  expect(existsSync(join(APP_DIR, 'server/auth/index.ts'))).toBe(true)
  expect(existsSync(join(APP_DIR, 'server/auth/middleware.ts'))).toBe(true)
  expect(existsSync(join(APP_DIR, 'server/auth/providers/usernameAndPassword.ts'))).toBe(true)
})

test('CRUD route for Todo is generated', () => {
  expect(existsSync(join(APP_DIR, 'server/routes/crud/todo.ts'))).toBe(true)
})

// ── SPA frontend files ────────────────────────────────────────────────────────

test('Vite config is generated (.ts)', () => {
  expect(existsSync(join(APP_DIR, 'vite.config.ts'))).toBe(true)
})

test('index.html is generated', () => {
  expect(existsSync(join(APP_DIR, 'index.html'))).toBe(true)
})

test('Vue main entry is generated (.ts)', () => {
  expect(existsSync(join(APP_DIR, 'src/main.ts'))).toBe(true)
})

test('App.vue is generated', () => {
  expect(existsSync(join(APP_DIR, 'src/App.vue'))).toBe(true)
})

test('Vue router is generated (.ts)', () => {
  expect(existsSync(join(APP_DIR, 'src/router/index.ts'))).toBe(true)
})

test('Login.vue is generated (auth enabled)', () => {
  expect(existsSync(join(APP_DIR, 'src/pages/Login.vue'))).toBe(true)
})

test('Register.vue is generated (auth enabled)', () => {
  expect(existsSync(join(APP_DIR, 'src/pages/Register.vue'))).toBe(true)
})

// ── package.json content ──────────────────────────────────────────────────────

test('package.json has correct app name (kebab-case of fixture app block)', () => {
  const pkg = JSON.parse(readFileSync(join(APP_DIR, 'package.json'), 'utf8'))
  // E2ETodo → e2-e-todo via Vasp's toKebabCase helper
  expect(pkg.name).toBe('e2-e-todo')
})

test('package.json depends on elysia', () => {
  const pkg = JSON.parse(readFileSync(join(APP_DIR, 'package.json'), 'utf8'))
  expect(pkg.dependencies).toHaveProperty('elysia')
})

test('package.json depends on @vasp-framework/runtime', () => {
  const pkg = JSON.parse(readFileSync(join(APP_DIR, 'package.json'), 'utf8'))
  expect(pkg.dependencies).toHaveProperty('@vasp-framework/runtime')
})

test('package.json depends on @elysiajs/jwt (auth enabled)', () => {
  const pkg = JSON.parse(readFileSync(join(APP_DIR, 'package.json'), 'utf8'))
  expect(pkg.dependencies).toHaveProperty('@elysiajs/jwt')
})

// ── E2E_MAGIC_TOKEN present in generated .env.example ────────────────────────

test('.env.example includes E2E_MAGIC_TOKEN', () => {
  const envExample = readFileSync(join(APP_DIR, '.env.example'), 'utf8')
  expect(envExample).toContain('E2E_MAGIC_TOKEN')
})
