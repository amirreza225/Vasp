import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** Write a file, creating parent directories as needed. */
export function writeFile(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content, 'utf8')
}

/** Create a directory (and all parents). */
export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true })
}
