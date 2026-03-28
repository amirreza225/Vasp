/**
 * Playwright global teardown for the project-hub suite.
 */
import { FixtureHarness } from '../../lib/FixtureHarness.mts'
import { FIXTURES } from '../../lib/fixture-registry.mts'

export default async function globalTeardown() {
  const harness = new FixtureHarness(FIXTURES['project-hub']!)
  await harness.teardown()
}
