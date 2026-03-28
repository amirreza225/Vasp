/**
 * Playwright global setup for the minimal suite.
 * Delegates to FixtureHarness — thin wrapper only.
 */
import { FixtureHarness } from '../../lib/FixtureHarness.mts'
import { FIXTURES } from '../../lib/fixture-registry.mts'

export default async function globalSetup() {
  const harness = new FixtureHarness(FIXTURES['minimal']!)
  await harness.setup()
}
