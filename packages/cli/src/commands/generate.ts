import { generate } from '@vasp-framework/generator'
import { Manifest, computeHash } from '@vasp-framework/generator'
import { parse } from '@vasp-framework/parser'
import { join, resolve } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { log } from '../utils/logger.js'
import { handleParseError } from '../utils/parse-error.js'
import { resolveTemplateDir } from '../utils/template-dir.js'

interface GenerateOptions {
  force: boolean
  dryRun: boolean
}

export interface RegenerateResult {
  success: boolean
  added: number
  updated: number
  skipped: number
  errors: string[]
}

/**
 * Shared generation logic used by both `vasp generate` and the `main.vasp` watcher
 * in `vasp start`. Reads main.vasp from `projectDir`, parses it, and generates
 * into `projectDir` — preserving user-modified files (unless `force` is true).
 *
 * Returns a result object instead of calling process.exit() so callers (e.g. the
 * watcher in start.ts) can decide how to handle errors gracefully.
 */
export async function runRegenerate(
  projectDir: string,
  force = false,
): Promise<RegenerateResult> {
  const vaspFile = join(projectDir, 'main.vasp')

  if (!existsSync(vaspFile)) {
    return { success: false, added: 0, updated: 0, skipped: 0, errors: ['main.vasp not found'] }
  }

  const source = readFileSync(vaspFile, 'utf8')

  let ast
  try {
    ast = parse(source, 'main.vasp')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, added: 0, updated: 0, skipped: 0, errors: [msg] }
  }

  const previousManifest = Manifest.load(projectDir)
  const templateDir = resolveTemplateDir(import.meta.dirname)

  const result = generate(ast, {
    outputDir: projectDir,
    templateDir,
    logLevel: force ? 'info' : 'silent',
  })

  if (!result.success) {
    return { success: false, added: 0, updated: 0, skipped: 0, errors: result.errors }
  }

  const stats = computeDiff(previousManifest, result.filesWritten, projectDir)
  return { success: true, errors: [], ...stats }
}

/**
 * `vasp generate` — regenerate the app from main.vasp, preserving user-modified files.
 *
 * The manifest stored in `.vasp/manifest.json` tracks the hash of every generated file.
 * A file is considered "user-modified" when the on-disk content differs from the
 * last-generated hash. User-modified files are skipped unless --force is passed.
 */
export async function generateCommand(args: string[]): Promise<void> {
  const opts = parseOptions(args)
  const projectDir = resolve(process.cwd())
  const vaspFile = join(projectDir, 'main.vasp')

  if (!existsSync(vaspFile)) {
    log.error(`No main.vasp found in ${projectDir}. Run 'vasp generate' from your project root.`)
    process.exit(1)
  }

  const source = readFileSync(vaspFile, 'utf8')

  let ast
  try {
    ast = parse(source, 'main.vasp')
  } catch (err) {
    handleParseError(err, source, 'main.vasp')
  }

  // Load previous manifest to detect user-modified files
  const previousManifest = Manifest.load(projectDir)

  if (!previousManifest) {
    log.warn('No manifest found — this looks like a fresh app. Use vasp new instead.')
    log.warn('Running full generation anyway...')
  }

  if (opts.dryRun) {
    log.step('[dry-run] vasp generate — showing what would change')
    await runDryRun(ast, projectDir, previousManifest, opts)
    return
  }

  if (previousManifest && !opts.force) {
    const skipped = detectUserModifiedFiles(projectDir, previousManifest)
    if (skipped.length > 0) {
      log.step('Skipping user-modified files (run with --force to overwrite):')
      for (const f of skipped) log.dim(`  skip  ${f}`)
    }
  }

  log.step('Regenerating app...')

  const result = await runRegenerate(projectDir, opts.force)

  if (!result.success) {
    log.error('Generation failed:')
    for (const err of result.errors) log.error(err)
    process.exit(1)
  }

  log.success(`Done: ${result.added} added, ${result.updated} updated, ${result.skipped} skipped`)

  if (result.skipped > 0 && !opts.force) {
    log.dim(`  ${result.skipped} user-modified file(s) preserved — use --force to overwrite`)
  }
}

function detectUserModifiedFiles(projectDir: string, manifest: Manifest): string[] {
  const modified: string[] = []
  for (const [relPath, entry] of Object.entries(manifest.files)) {
    // Never skip src/ files — those are always user-owned
    if (relPath.startsWith('src/')) continue
    const fullPath = join(projectDir, relPath)
    if (!existsSync(fullPath)) continue
    const onDisk = readFileSync(fullPath, 'utf8')
    const diskHash = computeHash(onDisk)
    if (diskHash !== entry.hash) {
      modified.push(relPath)
    }
  }
  return modified
}

function computeDiff(
  previous: Manifest | null,
  filesWritten: string[],
  _projectDir: string,
): { added: number; updated: number; skipped: number } {
  let added = 0
  let updated = 0

  for (const f of filesWritten) {
    if (!previous?.hasFile(f)) {
      added++
    } else {
      updated++
    }
  }

  const previousCount = previous ? Object.keys(previous.files).length : 0
  const skipped = Math.max(0, previousCount - filesWritten.length)

  return { added, updated, skipped }
}

async function runDryRun(
  ast: ReturnType<typeof parse>,
  projectDir: string,
  previousManifest: Manifest | null,
  _opts: GenerateOptions,
): Promise<void> {
  const templateDir = resolveTemplateDir(import.meta.dirname)
  const result = generate(ast, {
    outputDir: join(projectDir, '.vasp', 'dry-run'),
    templateDir,
    logLevel: 'silent',
  })

  if (!result.success) {
    log.error('Dry-run failed')
    process.exit(1)
  }

  let added = 0
  let updated = 0
  let preserved = 0

  for (const f of result.filesWritten) {
    if (!previousManifest?.hasFile(f)) {
      log.info(`  + ${f}`)
      added++
    } else {
      const fullPath = join(projectDir, f)
      if (existsSync(fullPath)) {
        const onDisk = readFileSync(fullPath, 'utf8')
        const diskHash = computeHash(onDisk)
        const prevHash = previousManifest.getEntry(f)?.hash
        if (diskHash !== prevHash) {
          log.warn(`  ~ ${f} (user-modified — would skip)`)
          preserved++
        } else {
          log.dim(`  = ${f}`)
          updated++
        }
      } else {
        log.info(`  + ${f}`)
        added++
      }
    }
  }

  log.step(`[dry-run] ${added} would be added, ${updated} unchanged, ${preserved} preserved`)

  // Clean up dry-run output dir
  try {
    const { rmSync } = await import('node:fs')
    rmSync(join(projectDir, '.vasp', 'dry-run'), { recursive: true, force: true })
  } catch {
    // Ignore cleanup errors
  }
}

function parseOptions(args: string[]): GenerateOptions {
  return {
    force: args.includes('--force') || args.includes('-f'),
    dryRun: args.includes('--dry-run'),
  }
}
