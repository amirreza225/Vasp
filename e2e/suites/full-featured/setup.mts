/**
 * Playwright global setup for the full-featured suite.
 * Starts Redis, RabbitMQ, and Kafka before scaffolding the app.
 */
import { FixtureHarness } from '../../lib/FixtureHarness.mts'
import { FIXTURES } from '../../lib/fixture-registry.mts'

export default async function globalSetup() {
  const harness = new FixtureHarness(FIXTURES['full-featured']!)
  await harness.setup()
}
