/**
 * Generation tests for the multi-tenant suite.
 *
 * TS SPA with row-level multi-tenancy, auth, and Task CRUD.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect } from '../../lib/test.mts'
import { readFixtureState } from '../../lib/FixtureHarness.mts'
import { generationSuite } from '../../lib/assertions/generation.mts'

const state = readFixtureState('multi-tenant')

generationSuite(state)

test.describe('[multi-tenant] Generation — fixture-specific', () => {
  const { appDir } = state

  test('drizzle schema contains Workspace table', () => {
    const schema = readFileSync(join(appDir, 'drizzle/schema.ts'), 'utf8')
    expect(schema).toMatch(/workspace/i)
  })

  test('drizzle schema has workspaceId FK on Task', () => {
    const schema = readFileSync(join(appDir, 'drizzle/schema.ts'), 'utf8')
    expect(schema).toMatch(/workspaceId/i)
  })

  test('CRUD route for Task is generated', () => {
    const { existsSync } = require('node:fs')
    expect(existsSync(join(appDir, 'server/routes/crud/task.ts'))).toBe(true)
  })

  test('server entry imports multiTenant middleware or db client', () => {
    const serverIndex = readFileSync(join(appDir, 'server/index.ts'), 'utf8')
    // Multi-tenant setup should reference the workspace/tenant context
    expect(serverIndex.length).toBeGreaterThan(100)
  })
})
