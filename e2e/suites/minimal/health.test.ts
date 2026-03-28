/**
 * Backend health tests for the minimal fixture.
 */

import { readFixtureState } from '../../lib/FixtureHarness.mts'
import { healthSuite } from '../../lib/assertions/health.mts'

const state = readFixtureState('minimal')

healthSuite({
  backendUrl: state.backendUrl,
  frontendUrl: state.frontendUrl,
  appTitle: 'Minimal App',
})
