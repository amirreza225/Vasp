/**
 * Playwright global setup for the e2e-todo suite (migrated from tests/fullstack/).
 */
import { FixtureHarness } from '../../lib/FixtureHarness.mts'
import { FIXTURES } from '../../lib/fixture-registry.mts'

export default async function globalSetup() {
  const harness = new FixtureHarness(FIXTURES['e2e-todo']!)
  await harness.setup()
}
