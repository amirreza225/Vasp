/**
 * Generation tests for the minimal fixture.
 *
 * Verifies that `vasp new` + `vasp generate --force` produce all expected
 * output files for a JS-mode SPA with no entities and no auth.
 */

import { readFixtureState } from '../../lib/FixtureHarness.mts'
import { generationSuite } from '../../lib/assertions/generation.mts'

const state = readFixtureState('minimal')

generationSuite(state)
