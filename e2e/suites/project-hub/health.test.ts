/**
 * Backend health tests for the project-hub suite.
 */

import { readFixtureState } from '../../lib/FixtureHarness.mts'
import { healthSuite } from '../../lib/assertions/health.mts'

const state = readFixtureState('project-hub')

healthSuite({
  backendUrl: state.backendUrl,
  frontendUrl: state.frontendUrl,
  appTitle: 'ProjectHub SaaS',
})
