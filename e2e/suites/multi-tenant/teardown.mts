/**
 * Playwright global teardown for the multi-tenant suite.
 */
import { FixtureHarness } from '../../lib/FixtureHarness.mts'
import { FIXTURES } from '../../lib/fixture-registry.mts'

export default async function globalTeardown() {
  const harness = new FixtureHarness(FIXTURES['multi-tenant']!)
  await harness.teardown()
}
