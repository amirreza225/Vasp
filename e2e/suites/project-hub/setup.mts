/**
 * Playwright global setup for the project-hub suite.
 * Starts the full infra stack: Redis, RabbitMQ, Kafka, MinIO, Mailpit.
 */
import { FixtureHarness } from '../../lib/FixtureHarness.mts'
import { FIXTURES } from '../../lib/fixture-registry.mts'

export default async function globalSetup() {
  const harness = new FixtureHarness(FIXTURES['project-hub']!)
  await harness.setup()
}
