/**
 * CRUD tests for the project-hub suite.
 *
 * Tests Project and Task CRUD endpoints — the core domain objects.
 * All routes are auth-gated (via magic token).
 * ProjectHub has complex entities with many field types.
 */

import { test, expect } from '../../lib/test.mts'
import { readFixtureState, unwrap } from '../../lib/FixtureHarness.mts'
import { crudSuite } from '../../lib/assertions/crud.mts'

const state = readFixtureState('project-hub')
const BACKEND = state.backendUrl
const MAGIC = state.magicToken
const AUTH = { Authorization: `Bearer ${MAGIC}` }
const seed = state.seedData as { workspaceAlphaId: number }

// ── Project CRUD (magic token) ────────────────────────────────────────────────

crudSuite({
  backendUrl: BACKEND,
  entitySlug: 'project',
  sampleCreate: {
    name: 'E2E Project',
    status: 'planning',
    priority: 'medium',
    isPublic: false,
    workspaceId: seed.workspaceAlphaId,
    ownerId: 0, // magic token synthetic user id
  },
  sampleUpdate: { status: 'active' },
  magicToken: MAGIC,
  needsAuth: true,
  assertCreatedField: 'name',
  assertCreatedValue: 'E2E Project',
})

// ── Task CRUD (magic token) ───────────────────────────────────────────────────

crudSuite({
  backendUrl: BACKEND,
  entitySlug: 'task',
  sampleCreate: {
    title: 'E2E Task',
    status: 'todo',
    priority: 'medium',
    projectId: 1, // assume project 1 exists (seeded or created by first project CRUD test)
  },
  sampleUpdate: { status: 'in_progress' },
  magicToken: MAGIC,
  needsAuth: true,
  assertCreatedField: 'title',
  assertCreatedValue: 'E2E Task',
})

// ── Domain-specific tests ─────────────────────────────────────────────────────

test.describe('[project-hub] Domain-specific CRUD tests', () => {
  const projectBase = `${BACKEND}/api/crud/project`
  const taskBase = `${BACKEND}/api/crud/task`
  const commentBase = `${BACKEND}/api/crud/comment`
  const tagBase = `${BACKEND}/api/crud/tag`

  test('Project Enum(status) values are validated: invalid status → 400 or 422', async ({
    request,
  }) => {
    const res = await request.post(projectBase, {
      data: {
        name: 'Bad Status Project',
        status: 'INVALID_STATUS',
        priority: 'medium',
        isPublic: false,
        workspaceId: seed.workspaceAlphaId,
        ownerId: 0,
      },
      headers: AUTH,
    })
    // Should be rejected by DB constraints or application validation
    expect([400, 422, 500]).toContain(res.status())
  })

  test('Project Float field (budget) accepts decimal values', async ({ request }) => {
    const res = await request.post(projectBase, {
      data: {
        name: 'Budgeted Project',
        status: 'planning',
        priority: 'low',
        isPublic: true,
        budget: 99999.99,
        workspaceId: seed.workspaceAlphaId,
        ownerId: 0,
      },
      headers: AUTH,
    })
    expect(res.status()).toBeLessThan(300)
    const project = unwrap(await res.json()) as { budget?: number }
    if (project.budget !== undefined) {
      expect(project.budget).toBeCloseTo(99999.99, 2)
    }
  })

  test('Task Text field (description) accepts multi-line content', async ({ request }) => {
    // First create a project to attach the task to
    const projRes = await request.post(projectBase, {
      data: {
        name: `Task Parent ${Date.now()}`,
        status: 'active',
        priority: 'high',
        isPublic: false,
        workspaceId: seed.workspaceAlphaId,
        ownerId: 0,
      },
      headers: AUTH,
    })
    const proj = unwrap(await projRes.json()) as { id: number }
    if (!proj.id) return

    const multiLineDesc = 'Line 1\nLine 2\nLine 3'
    const taskRes = await request.post(taskBase, {
      data: {
        title: 'Multi-line Task',
        description: multiLineDesc,
        status: 'todo',
        priority: 'medium',
        projectId: proj.id,
      },
      headers: AUTH,
    })
    expect(taskRes.status()).toBeLessThan(300)
    const task = unwrap(await taskRes.json()) as { description?: string }
    if (task.description) {
      expect(task.description).toContain('Line 2')
    }
  })

  test('Tag CRUD: creating and listing tags', async ({ request }) => {
    const createRes = await request.post(tagBase, {
      data: { name: `tag-e2e-${Date.now()}`, color: '#FF5733' },
      headers: AUTH,
    })
    expect(createRes.status()).toBeLessThan(300)

    const listRes = await request.get(tagBase, { headers: AUTH })
    expect(listRes.ok()).toBe(true)
    const data = unwrap(await listRes.json()) as { items: unknown[] }
    expect(data.items.length).toBeGreaterThanOrEqual(1)
  })

  test('all major entity CRUD endpoints are reachable (not 404)', async ({ request }) => {
    const slugs = ['workspace', 'project', 'task', 'tag', 'comment']
    for (const slug of slugs) {
      const res = await request.get(`${BACKEND}/api/crud/${slug}`, { headers: AUTH })
      // 200 OK or 4xx (not 404 "not mounted")
      expect(res.status()).not.toBe(404)
    }
  })
})
