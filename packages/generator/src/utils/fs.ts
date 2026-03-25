import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

/** Write a file, creating parent directories as needed. */
export function writeFile(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content, 'utf8')
}

/** Create a directory (and all parents). */
export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true })
}

/** Parse a .env file into key-value pairs. */
export function parseEnvFile(content: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue
    env[trimmed.slice(0, eqIndex).trim()] = trimmed.slice(eqIndex + 1).trim()
  }
  return env
}

/** Check if a .env value looks like a placeholder. */
export function isPlaceholderValue(value: string): boolean {
  const v = value.trim()
  if (!v) return true
  const patterns = [
    /^postgres:\/\/user:password@localhost/,
    /^change-me/i,
    /^your[_-]/i,
    /^placeholder/i,
    /^CHANGE_ME/,
    /^<.+>$/,
    /^changeme$/i,
    /^secret$/i,
    /^password$/i,
  ]
  return patterns.some(p => p.test(v))
}

/**
 * Copy all files from a staging directory to the real output directory.
 * Optionally preserves `.env` if it already exists with non-placeholder values.
 */
export function commitStagedFiles(
  stagingDir: string,
  realDir: string,
  options: { preserveEnv?: boolean } = {},
): void {
  const protectedFiles = new Set<string>()

  if (options.preserveEnv) {
    const realEnvPath = join(realDir, '.env')
    if (existsSync(realEnvPath)) {
      const existing = parseEnvFile(readFileSync(realEnvPath, 'utf8'))
      const dbUrl = existing['DATABASE_URL']
      if (dbUrl && !isPlaceholderValue(dbUrl)) {
        protectedFiles.add('.env')
      }
    }
  }

  copyDirRecursive(stagingDir, realDir, stagingDir, protectedFiles)
}

function copyDirRecursive(
  src: string,
  dest: string,
  base: string,
  protectedFiles: Set<string>,
): void {
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name)
    const destPath = join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath, base, protectedFiles)
    } else {
      const relPath = relative(base, srcPath)
      if (protectedFiles.has(relPath)) continue
      mkdirSync(dirname(destPath), { recursive: true })
      copyFileSync(srcPath, destPath)
    }
  }
}

/** Remove a directory tree (no-op if it doesn't exist). */
export function cleanupDir(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true })
  }
}
