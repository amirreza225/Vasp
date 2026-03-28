/**
 * Backend health tests for the multi-tenant suite.
 */

import { readFixtureState } from '../../lib/FixtureHarness.mts'
import { healthSuite } from '../../lib/assertions/health.mts'

const state = readFixtureState('multi-tenant')

healthSuite({ backendUrl: state.backendUrl, frontendUrl: state.frontendUrl })
