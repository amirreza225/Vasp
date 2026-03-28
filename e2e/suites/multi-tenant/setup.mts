/**
 * Playwright global setup for the multi-tenant suite.
 * Seeds two workspace rows before starting the backend.
 */
import { FixtureHarness } from '../../lib/FixtureHarness.mts'
import { FIXTURES } from '../../lib/fixture-registry.mts'

export default async function globalSetup() {
  const harness = new FixtureHarness(FIXTURES['multi-tenant']!)
  await harness.setup()
}
