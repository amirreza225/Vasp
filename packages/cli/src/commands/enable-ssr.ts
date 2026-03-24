import { generate } from '@vasp-framework/generator'
import { parse } from '@vasp-framework/parser'
import { join, resolve } from 'node:path'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { log } from '../utils/logger.js'

/**
 * `vasp enable-ssr` — patches main.vasp (ssr: false → ssr: true) and regenerates
 */
export async function enableSsrCommand(): Promise<void> {
  const projectDir = resolve(process.cwd())
  const vaspFile = join(projectDir, 'main.vasp')

  if (!existsSync(vaspFile)) {
    log.error(`No main.vasp found in ${projectDir}. Run this command inside a Vasp project.`)
    process.exit(1)
  }

  let source = readFileSync(vaspFile, 'utf8')

  if (/ssr:\s*true/.test(source) || /ssr:\s*"ssg"/.test(source)) {
    log.warn('SSR is already enabled in main.vasp — nothing to do.')
    return
  }

  if (!/ssr:\s*false/.test(source)) {
    log.error("Could not find 'ssr: false' in main.vasp. Please update it manually.")
    process.exit(1)
  }

  // Patch ssr: false → ssr: true
  source = source.replace(/ssr:\s*false/, 'ssr: true')
  writeFileSync(vaspFile, source, 'utf8')
  log.step('Patched main.vasp: ssr: false → ssr: true')

  // Re-parse and regenerate
  let ast
  try {
    ast = parse(source, 'main.vasp')
  } catch (err) {
    log.error(`Failed to parse updated main.vasp: ${String(err)}`)
    process.exit(1)
  }

  const templateDir = join(import.meta.dirname, '..', '..', '..', '..', 'templates')

  const result = generate(ast, {
    outputDir: projectDir,
    templateDir,
    logLevel: 'info',
  })

  if (!result.success) {
    log.error('Regeneration failed:')
    for (const err of result.errors) log.error(err)
    process.exit(1)
  }

  log.success(`SSR enabled — ${result.filesWritten.length} files regenerated`)
  log.dim('  Run: bun install (if you have new deps)')
  log.dim('  Run: vasp start')
}
