/**
 * Tenant isolation tests for the multi-tenant suite.
 *
 * Verifies that the row-level multi-tenancy DSL block enforces workspace
 * scoping: tasks created in workspace-alpha are invisible to workspace-beta users.
 *
 * Uses the tenantIsolationSuite from the shared assertion library.
 */

import { readFixtureState } from '../../lib/FixtureHarness.mts'
import { tenantIsolationSuite } from '../../lib/assertions/tenant.mts'
import type { MultiTenantSeedData } from '../../lib/assertions/tenant.mts'

const state = readFixtureState('multi-tenant')

tenantIsolationSuite({
  backendUrl: state.backendUrl,
  entitySlug: 'task',
  sampleCreate: { title: 'My Tenant Task', done: false },
  sampleUpdate: { done: true },
  seedData: state.seedData as MultiTenantSeedData,
})
