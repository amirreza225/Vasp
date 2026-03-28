/**
 * Generation tests for the todo-app fixture.
 *
 * JS SPA with one entity (Todo), query/action, and CRUD — no auth.
 */

import { readFixtureState } from '../../lib/FixtureHarness.mts'
import { generationSuite } from '../../lib/assertions/generation.mts'

const state = readFixtureState('todo-app')

generationSuite(state)
