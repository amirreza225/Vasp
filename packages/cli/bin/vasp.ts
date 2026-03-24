#!/usr/bin/env bun
// Vasp CLI entry point

import { run } from '../src/index.js'

await run(process.argv.slice(2))
