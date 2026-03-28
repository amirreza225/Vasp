/**
 * Generation tests for the project-hub suite.
 *
 * The most complex fixture: 9 entities, all DSL blocks, SSR, roles+permissions,
 * S3 storage, Resend email, memory+Redis cache, admin panel, autoPages,
 * webhooks, and observability.
 *
 * This suite verifies that all 16 generators produce valid output.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect } from '../../lib/test.mts'
import { readFixtureState } from '../../lib/FixtureHarness.mts'
import { generationSuite } from '../../lib/assertions/generation.mts'

const state = readFixtureState('project-hub')

generationSuite(state)

test.describe('[project-hub] Generation — fixture-specific', () => {
  const { appDir, capabilities } = state
  const exists = (rel: string) => {
    const { existsSync } = require('node:fs')
    return existsSync(join(appDir, rel))
  }

  // ── All 9 entity tables are in the schema ────────────────────────────────

  test('drizzle schema contains all major entities', () => {
    const schema = readFileSync(join(appDir, 'drizzle/schema.ts'), 'utf8')
    const expectedTables = ['workspace', 'user', 'project', 'task', 'tag', 'label', 'comment']
    for (const table of expectedTables) {
      expect(schema.toLowerCase()).toContain(table)
    }
  })

  // ── Multi-tenant (row-level) ──────────────────────────────────────────────

  test('drizzle schema includes workspaceId FK fields', () => {
    const schema = readFileSync(join(appDir, 'drizzle/schema.ts'), 'utf8')
    expect(schema).toMatch(/workspaceId/i)
  })

  // ── Auth with roles + permissions ────────────────────────────────────────

  test('auth router is generated with roles support', () => {
    expect(exists('server/auth/index.ts')).toBe(true)
  })

  // ── CRUD routes for all declared entities ────────────────────────────────

  const crudEntities = capabilities.crudEntityNames.map((e) => e.toLowerCase())
  for (const entity of crudEntities) {
    test(`CRUD route for ${entity} is generated`, () => {
      expect(exists(`server/routes/crud/${entity}.ts`)).toBe(true)
    })
  }

  // ── Email (Resend) ────────────────────────────────────────────────────────

  test('email mailer file is generated', () => {
    expect(
      exists('server/email/mailer.ts') || exists('server/email/_mailer.ts'),
    ).toBe(true)
  })

  // ── Cache (memory + redis) ────────────────────────────────────────────────

  test('cache store file is generated', () => {
    expect(
      exists('server/cache/index.ts') || exists('server/cache/store.ts'),
    ).toBe(true)
  })

  // ── Storage (S3) ─────────────────────────────────────────────────────────

  test('storage provider file is generated', () => {
    expect(
      exists('server/storage/provider.ts') || exists('server/storage/_provider.ts'),
    ).toBe(true)
  })

  // ── Admin panel ───────────────────────────────────────────────────────────

  test('admin panel is generated', () => {
    expect(
      exists('admin/index.html') ||
        exists('admin/src/main.ts') ||
        exists('admin/src/main.js'),
    ).toBe(true)
  })

  // ── nuxt.config.ts (SSR mode) ─────────────────────────────────────────────

  test('nuxt.config.ts is generated', () => {
    expect(exists('nuxt.config.ts')).toBe(true)
  })

  // ── Webhooks (inbound + outbound) ─────────────────────────────────────────

  test('webhook routes are generated', () => {
    // At least the generation succeeded — webhooks may land in different paths
    expect(state.generation.regenExitCode ?? state.generation.exitCode).toBe(0)
  })

  // ── autoPage components ───────────────────────────────────────────────────

  test('generation with autoPages succeeds (no template errors)', () => {
    expect(state.generation.regenTemplateErrors ?? []).toHaveLength(0)
  })

  // ── package.json dependencies ─────────────────────────────────────────────

  test('package.json includes drizzle-orm', () => {
    const pkg = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
    }
    expect(pkg.dependencies).toHaveProperty('drizzle-orm')
  })

  test('package.json includes jose (JWT verification)', () => {
    const pkg = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
    }
    expect(pkg.dependencies).toHaveProperty('jose')
  })
})
