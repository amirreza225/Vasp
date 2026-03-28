/**
 * Realtime WebSocket tests for the full-featured suite.
 *
 * The full-featured fixture declares a `realtime TodoChannel { entity: Todo }` block.
 * Tests connect to the generated WebSocket endpoint and verify it behaves correctly.
 */

import { readFixtureState } from '../../lib/FixtureHarness.mts'
import { realtimeSuite } from '../../lib/assertions/realtime.mts'

const state = readFixtureState('full-featured')

realtimeSuite({
  backendUrl: state.backendUrl,
  channelSlug: 'TodoChannel',
  magicToken: state.magicToken,
})
