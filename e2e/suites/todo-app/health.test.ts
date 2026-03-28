/**
 * Backend health tests for the todo-app fixture.
 */

import { readFixtureState } from '../../lib/FixtureHarness.mts'
import { healthSuite } from '../../lib/assertions/health.mts'

const state = readFixtureState('todo-app')

healthSuite({ backendUrl: state.backendUrl, frontendUrl: state.frontendUrl })
