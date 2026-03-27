#!/usr/bin/env bun
/**
 * Exhaustiveness checker for Vasp DSL type discriminants.
 *
 * Replaces the CodeQL queries in .github/codeql/queries/ with a fast,
 * dependency-free Bun script. Two checks are performed:
 *
 *   1. PrimitiveFieldType exhaustiveness
 *      Any .ts file that compares .type against 3+ PrimitiveFieldType strings
 *      is assumed to be exhaustive. Missing entries are reported as errors.
 *
 *   2. VaspNode switch exhaustiveness
 *      Any .ts file that has switch-case clauses covering 3+ VaspNode type
 *      strings AND a default-throw block is assumed to be exhaustive.
 *      Missing cases are reported as errors.
 *
 * MAINTENANCE: keep the two sets below in sync with packages/core/src/types/ast.ts.
 * Add a new entry here whenever you add to PrimitiveFieldType or VaspNode.
 *
 * Usage:
 *   bun scripts/check-exhaustiveness.ts
 */

import { readdir, readFile } from "node:fs/promises"
import { join, relative } from "node:path"

// ---------------------------------------------------------------------------
// Source of truth — mirror packages/core/src/types/ast.ts
// ---------------------------------------------------------------------------

const PRIMITIVE_FIELD_TYPES: ReadonlySet<string> = new Set([
  "String",
  "Int",
  "Boolean",
  "DateTime",
  "Float",
  "Text",
  "Json",
  "Enum",
  "File",
])

const VASP_NODE_TYPES: ReadonlySet<string> = new Set([
  "App",
  "Auth",
  "Entity",
  "Route",
  "Page",
  "Query",
  "Action",
  "Api",
  "Middleware",
  "Crud",
  "Realtime",
  "Job",
  "Seed",
  "Admin",
  "Storage",
  "Email",
  "Cache",
])

// ---------------------------------------------------------------------------
// File walker — skips node_modules, dist, test files, and .d.ts files
// ---------------------------------------------------------------------------

async function walkTs(dir: string): Promise<string[]> {
  const files: string[] = []
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return files
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist") continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await walkTs(full)))
    } else if (
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".d.ts") &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".spec.ts")
    ) {
      files.push(full)
    }
  }
  return files
}

// ---------------------------------------------------------------------------
// Pattern matchers
// ---------------------------------------------------------------------------

/**
 * Finds all string values compared against a `.type` property in the file.
 * Matches both orderings:
 *   something.type === "Foo"
 *   "Foo" === something.type
 * Filters to only values present in the provided known-type set.
 */
function findTypeComparisons(
  content: string,
  knownTypes: ReadonlySet<string>,
): Set<string> {
  const found = new Set<string>()
  const re =
    /(?:\.type\s*[!=]==\s*["']([^"']+)["']|["']([^"']+)["']\s*[!=]==\s*\S*\.type)/g
  for (const match of content.matchAll(re)) {
    const val = match[1] ?? match[2]
    if (val && knownTypes.has(val)) found.add(val)
  }
  return found
}

/**
 * Finds all `case "X":` string values in the file,
 * filtered to the provided known-type set.
 */
function findSwitchCaseValues(
  content: string,
  knownTypes: ReadonlySet<string>,
): Set<string> {
  const found = new Set<string>()
  const re = /case\s+["']([^"']+)["']\s*:/g
  for (const match of content.matchAll(re)) {
    const val = match[1]
    if (val && knownTypes.has(val)) found.add(val)
  }
  return found
}

/**
 * Returns true if the file contains a default case that throws.
 * Pattern: `default:` followed within 300 chars by a `throw` statement.
 * This is the exhaustive-intent marker.
 */
function hasDefaultThrow(content: string): boolean {
  return /default\s*:[\s\S]{0,300}throw\s/.test(content)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const ROOT = join(import.meta.dir, "..")
const PACKAGES_DIR = join(ROOT, "packages")

const files = await walkTs(PACKAGES_DIR)
const issues: string[] = []

for (const file of files) {
  const content = await readFile(file, "utf8")
  const rel = relative(ROOT, file)

  // A file may opt out of a specific check with an inline marker:
  //   // @exhaustiveness-partial: field-type    ← skips PrimitiveFieldType check
  //   // @exhaustiveness-partial: vaspnode      ← skips VaspNode switch check
  // Use this only when the file handles the remaining types through a different
  // mechanism (e.g. a Set-based exclusion list) and the partial coverage is
  // intentional and documented in the code.
  const skipFieldType = content.includes("@exhaustiveness-partial: field-type")
  const skipVaspNode = content.includes("@exhaustiveness-partial: vaspnode")

  // ── Check 1: PrimitiveFieldType exhaustiveness ──────────────────────────
  if (!skipFieldType) {
    const fieldHits = findTypeComparisons(content, PRIMITIVE_FIELD_TYPES)
    if (fieldHits.size >= 3) {
      for (const t of PRIMITIVE_FIELD_TYPES) {
        if (!fieldHits.has(t)) {
          issues.push(
            `[field-type] ${rel}\n` +
              `  Compares .type against ${fieldHits.size} field types but is missing "${t}".\n` +
              `  Add a handler or update PRIMITIVE_FIELD_TYPES in scripts/check-exhaustiveness.ts.\n` +
              `  If this file intentionally handles a subset, add: // @exhaustiveness-partial: field-type`,
          )
        }
      }
    }
  }

  // ── Check 2: VaspNode switch exhaustiveness ──────────────────────────────
  if (!skipVaspNode) {
    const caseHits = findSwitchCaseValues(content, VASP_NODE_TYPES)
    if (caseHits.size >= 3 && hasDefaultThrow(content)) {
      for (const t of VASP_NODE_TYPES) {
        if (!caseHits.has(t)) {
          issues.push(
            `[vaspnode-switch] ${rel}\n` +
              `  Switch has a default-throw and covers ${caseHits.size} node types but is missing case "${t}".\n` +
              `  Add a case or update VASP_NODE_TYPES in scripts/check-exhaustiveness.ts.\n` +
              `  If this file intentionally handles a subset, add: // @exhaustiveness-partial: vaspnode`,
          )
        }
      }
    }
  }
}

if (issues.length > 0) {
  console.error(`\nExhaustiveness check failed — ${issues.length} issue(s):\n`)
  for (const issue of issues) console.error(issue + "\n")
  process.exit(1)
}

console.log(`Exhaustiveness check passed (${files.length} files scanned).`)
