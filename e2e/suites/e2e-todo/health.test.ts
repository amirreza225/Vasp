/**
 * Backend health tests for the e2e-todo suite.
 */

import { readFixtureState } from '../../lib/FixtureHarness.mts'
import { healthSuite } from '../../lib/assertions/health.mts'

const state = readFixtureState('e2e-todo')

healthSuite({
  backendUrl: state.backendUrl,
  frontendUrl: state.frontendUrl,
  appTitle: 'E2ETodo',
})
