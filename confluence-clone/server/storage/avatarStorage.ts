// provider: local | block: AvatarStorage
import { join } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'

/** Resolved absolute path for local file storage */
const UPLOAD_DIR = join(process.cwd(), '/uploads/avatars')
if (!existsSync(UPLOAD_DIR)) {
  mkdirSync(UPLOAD_DIR, { recursive: true })
}

/** Parse a human-readable size string (e.g. "10mb", "512kb") into bytes */
function parseMaxSize(size: string): number {
  const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/)
  if (!match) return 10 * 1024 * 1024 // default 10 MB
  const value = parseFloat(match[1]!)
  const unit = match[2] ?? 'b'
  const multiplier: Record<string, number> = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 }
  return Math.floor(value * (multiplier[unit] ?? 1))
}

export const MAX_BYTES = parseMaxSize('2mb')

/** MIME type patterns allowed for upload (supports wildcards like image/*) */
export const ALLOWED_TYPES: string[] = ['image/jpeg', 'image/png', 'image/webp']

export function isMimeAllowed(mime: string): boolean {
  return ALLOWED_TYPES.some((pattern) => {
    if (pattern.endsWith('/*')) {
      return mime.startsWith(pattern.slice(0, -1))
    }
    return mime === pattern
  })
}

/**
 * Save a file to local disk and return the public URL path.
 */
export async function saveFile(
  filename: string,
  buffer: ArrayBuffer,
): Promise<string> {
  const { writeFile } = await import('node:fs/promises')
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  const dest = join(UPLOAD_DIR, safeFilename)
  await writeFile(dest, Buffer.from(buffer))
  return `/uploads/avatars/${safeFilename}`
}
