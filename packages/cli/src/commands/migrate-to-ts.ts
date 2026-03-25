import { generate } from '@vasp-framework/generator'
import { parse } from '@vasp-framework/parser'
import { join, resolve } from 'node:path'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { readdirSync, statSync } from 'node:fs'
import { log } from '../utils/logger.js'
import { handleParseError } from '../utils/parse-error.js'
import { resolveTemplateDir } from '../utils/template-dir.js'

export async function migrateToTsCommand(): Promise<void> {
  const cwd = process.cwd()
  const vaspFile = join(cwd, 'main.vasp')

  if (!existsSync(vaspFile)) {
    log.error("No main.vasp found. Run this command from your Vasp project root.")
    process.exit(1)
  }

  const source = readFileSync(vaspFile, 'utf8')
  let ast
  try {
    ast = parse(source, 'main.vasp')
  } catch (err) {
    handleParseError(err, source, 'main.vasp')
  }

  if (ast.app.typescript) {
    log.warn("Project is already using TypeScript (typescript: true in main.vasp)")
    return
  }

  log.step('Migrating project to TypeScript...')

  // 1. Patch main.vasp: set typescript: true
  const patched = source.replace(/typescript:\s*false/, 'typescript: true')
  writeFileSync(vaspFile, patched, 'utf8')
  log.success('Updated main.vasp: typescript: true')

  // 2. Rename .js files in src/ and server/ to .ts
  const renamedFiles = renameJsToTs(join(cwd, 'src'))
  renameJsToTs(join(cwd, 'server'))

  if (renamedFiles.length > 0) {
    log.success(`Renamed ${renamedFiles.length} .js files to .ts`)
  }

  // 3. Re-parse with typescript: true and regenerate TypeScript scaffold files
  const updatedSource = readFileSync(vaspFile, 'utf8')
  const updatedAst = parse(updatedSource, 'main.vasp')

  const templateDir = resolveTemplateDir(import.meta.dirname)
  const result = generate(updatedAst, {
    outputDir: cwd,
    templateDir,
    logLevel: 'info',
  })

  if (!result.success) {
    log.error('Regeneration failed:')
    for (const err of result.errors) log.error(err)
    process.exit(1)
  }

  log.step('✓ Migration complete!')
  log.dim('Run: bun install  (to add TypeScript devDependencies)')
  log.dim('Run: bun run typecheck  (to verify zero type errors)')
}

function renameJsToTs(dir: string): string[] {
  const renamed: string[] = []
  if (!existsSync(dir)) return renamed

  const entries = readdirSync(dir)
  for (const entry of entries) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      renamed.push(...renameJsToTs(full))
    } else if (entry.endsWith('.js') && !entry.endsWith('.config.js')) {
      const newPath = full.slice(0, -3) + '.ts'
      renameSync(full, newPath)
      renamed.push(newPath)
    }
  }
  return renamed
}
