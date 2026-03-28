/**
 * Generation tests for the e2e-todo suite (migrated from tests/fullstack/).
 *
 * TS SPA with auth (usernameAndPassword) and Todo CRUD.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { readFixtureState } from '../../lib/FixtureHarness.mts'
import { generationSuite } from '../../lib/assertions/generation.mts'

const state = readFixtureState('e2e-todo')

generationSuite(state)

// ── e2e-todo-specific generation assertions ────────────────────────────────────

test.describe('[e2e-todo] Generation — fixture-specific', () => {
  const { appDir } = state

  test('package.json has correct app name', () => {
    const pkg = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8')) as {
      name: string
    }
    // e2-e-todo is the kebab-case of the app block name "E2ETodo"
    expect(pkg.name).toBe('e2-e-todo')
  })

  test('drizzle schema contains the Todo table', () => {
    const schema = readFileSync(join(appDir, 'drizzle/schema.ts'), 'utf8')
    expect(schema).toContain('todo')
  })

  test('CRUD route for Todo exists', () => {
    const { existsSync } = require('node:fs')
    expect(existsSync(join(appDir, 'server/routes/crud/todo.ts'))).toBe(true)
  })
})
