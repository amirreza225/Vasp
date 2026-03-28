/**
 * Backend health tests for the full-featured suite.
 */

import { readFixtureState } from '../../lib/FixtureHarness.mts'
import { healthSuite } from '../../lib/assertions/health.mts'

const state = readFixtureState('full-featured')

healthSuite({
  backendUrl: state.backendUrl,
  frontendUrl: state.frontendUrl,
  appTitle: 'Vasp Todo',
})
