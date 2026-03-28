/**
 * Playwright global teardown for the e2e-todo suite.
 */
import { FixtureHarness } from '../../lib/FixtureHarness.mts'
import { FIXTURES } from '../../lib/fixture-registry.mts'

export default async function globalTeardown() {
  const harness = new FixtureHarness(FIXTURES['e2e-todo']!)
  await harness.teardown()
}
