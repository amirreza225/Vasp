import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import type { Manifest } from "../manifest/Manifest.js";
import { computeHash } from "../manifest/Manifest.js";

/** Write a file, creating parent directories as needed. */
export function writeFile(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf8");
}

/** Create a directory (and all parents). */
export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

/** Parse a .env file into key-value pairs. */
export function parseEnvFile(content: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    env[trimmed.slice(0, eqIndex).trim()] = trimmed.slice(eqIndex + 1).trim();
  }
  return env;
}

/** Check if a .env value looks like a placeholder. */
export function isPlaceholderValue(value: string): boolean {
  const v = value.trim();
  if (!v) return true;
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
  ];
  return patterns.some((p) => p.test(v));
}

/**
 * Copy all files from a staging directory to the real output directory.
 * Optionally preserves `.env` if it already exists with non-placeholder values.
 * `main.vasp` is always preserved when it already exists — it is the user's
 * source of truth and must never be overwritten by `vasp generate`.
 */
export function commitStagedFiles(
  stagingDir: string,
  realDir: string,
  options: { preserveEnv?: boolean } = {},
): void {
  const protectedFiles = new Set<string>();

  if (options.preserveEnv) {
    const realEnvPath = join(realDir, ".env");
    if (existsSync(realEnvPath)) {
      const existing = parseEnvFile(readFileSync(realEnvPath, "utf8"));
      const dbUrl = existing["DATABASE_URL"];
      if (dbUrl && !isPlaceholderValue(dbUrl)) {
        protectedFiles.add(".env");
      }
    }
  }

  // main.vasp is the user's source of truth — never overwrite it once created.
  if (existsSync(join(realDir, "main.vasp"))) {
    protectedFiles.add("main.vasp");
  }

  copyDirRecursive(stagingDir, realDir, stagingDir, protectedFiles);
}

function copyDirRecursive(
  src: string,
  dest: string,
  base: string,
  protectedFiles: Set<string>,
): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath, base, protectedFiles);
    } else {
      const relPath = relative(base, srcPath);
      if (protectedFiles.has(relPath)) continue;
      mkdirSync(dirname(destPath), { recursive: true });
      copyFileSync(srcPath, destPath);
    }
  }
}

/** Remove a directory tree (no-op if it doesn't exist). */
export function cleanupDir(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Delete generated files that were tracked in `oldManifest` but are absent
 * from `newManifest`, provided the on-disk content has not been modified by
 * the user (verified by comparing the file's current SHA-256 hash against the
 * hash stored in `oldManifest`).
 *
 * After deleting files, any directory that has become empty as a result is
 * also removed (bottom-up, so intermediate empty parents are pruned too).
 *
 * Returns the list of relative paths that were deleted.
 */
export function deleteOrphanedFiles(
  oldManifest: Manifest,
  newManifest: Manifest,
  realOutputDir: string,
): string[] {
  const deleted: string[] = [];

  for (const [relPath, entry] of Object.entries(oldManifest.files)) {
    // Skip files that are still generated in the new run.
    if (newManifest.hasFile(relPath)) continue;

    const absPath = join(realOutputDir, relPath);
    if (!existsSync(absPath)) continue;

    // Only delete if the on-disk content matches the previously generated
    // content — i.e. the user has not hand-edited the file.
    let diskContent: string;
    try {
      diskContent = readFileSync(absPath, "utf8");
    } catch {
      continue;
    }
    if (computeHash(diskContent) !== entry.hash) continue;

    try {
      rmSync(absPath);
      deleted.push(relPath);
    } catch {
      // Best-effort — skip files we cannot remove (e.g. permission errors).
      continue;
    }
  }

  // Prune directories that are now empty (bottom-up).
  const dirsToCheck = new Set<string>();
  for (const relPath of deleted) {
    let dir = dirname(join(realOutputDir, relPath));
    while (dir.length > realOutputDir.length) {
      dirsToCheck.add(dir);
      dir = dirname(dir);
    }
  }

  // Sort deepest paths first so we prune children before parents.
  const sortedDirs = [...dirsToCheck].sort((a, b) => b.length - a.length);
  for (const dir of sortedDirs) {
    try {
      const entries = readdirSync(dir);
      if (entries.length === 0) {
        rmSync(dir, { recursive: true });
      }
    } catch {
      // Ignore — directory may have already been removed.
    }
  }

  return deleted;
}
