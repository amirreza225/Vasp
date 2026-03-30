/**
 * migrate.ts — vasp migrate command.
 *
 * Reads a v1 .vasp file and auto-upgrades it to v2 syntax, specifically:
 *   - entity fields that have inline modifiers are preserved as-is (v2 is a superset)
 *   - crud blocks with flat list/form properties are promoted to nested sub-blocks
 *     e.g. `paginate: true` becomes `list { paginate: true }`
 *
 * Writes the migrated content back to main.vasp (creates a .vasp.bak backup first).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { log } from "../utils/logger.js";

/**
 * Upgrade a single crud block's body from flat v1 syntax to v2 nested blocks.
 * This is a best-effort text transform — it only handles the common patterns
 * that the original parser accepted (no sub-block keywords).
 */
function upgradeCrudBlock(body: string): string {
  // Detect if the block already has a `list {` or `form {` sub-block — skip if so.
  if (/^\s*(list|form|permissions)\s*\{/m.test(body)) {
    return body; // already v2
  }

  // Properties that belong in the `list {}` sub-block
  const listProps = ["paginate", "sortable", "filterable", "search"];
  // Properties that belong in the `form {}` sub-block
  const formProps = ["layout"];

  const listLines: string[] = [];
  const formLines: string[] = [];
  const otherLines: string[] = [];

  for (const raw of body.split("\n")) {
    const trimmed = raw.trim();
    const propMatch = /^(\w+)\s*:/.exec(trimmed);
    if (!propMatch) {
      otherLines.push(raw);
      continue;
    }
    const key = propMatch[1] ?? "";
    if (listProps.includes(key)) {
      listLines.push(`    ${trimmed}`);
    } else if (formProps.includes(key)) {
      formLines.push(`    ${trimmed}`);
    } else {
      otherLines.push(raw);
    }
  }

  let result = otherLines.join("\n");

  if (listLines.length > 0) {
    result += `\n  list {\n${listLines.join("\n")}\n  }`;
  }
  if (formLines.length > 0) {
    result += `\n  form {\n${formLines.join("\n")}\n  }`;
  }

  return result;
}

/**
 * Apply v1 → v2 migration transforms to raw .vasp source text.
 * Uses a brace-counting approach to correctly extract block bodies
 * even when they contain nested braces (arrays, nested sub-blocks, etc.).
 */
function migrateSource(source: string): string {
  let result = "";
  let i = 0;

  while (i < source.length) {
    // Look for `crud <Name> {`
    const crudMatch = /\bcrud\s+(\w+)\s*\{/.exec(source.slice(i));
    if (!crudMatch || crudMatch.index === undefined) {
      result += source.slice(i);
      break;
    }

    // Copy everything before the crud block
    result += source.slice(i, i + crudMatch.index);
    const blockStart = i + crudMatch.index;

    // Find the opening brace position
    const openBraceIndex = blockStart + crudMatch[0].length - 1;

    // Use brace counting to find the matching closing brace
    let depth = 1;
    let j = openBraceIndex + 1;
    while (j < source.length && depth > 0) {
      if (source[j] === "{") depth++;
      else if (source[j] === "}") depth--;
      j++;
    }

    // Extract block body (between the outer braces)
    const body = source.slice(openBraceIndex + 1, j - 1);
    const upgraded = upgradeCrudBlock(body);
    result += `crud ${crudMatch[1]} {${upgraded}}`;
    i = j;
  }

  return result;
}

export async function migrateCommand(args: string[]): Promise<void> {
  const cwd = process.cwd();

  // Allow specifying a file path; default to main.vasp
  const filePath = args[0] ? join(cwd, args[0]) : join(cwd, "main.vasp");
  const backupPath = filePath + ".bak";

  let source: string;
  try {
    source = readFileSync(filePath, "utf8");
  } catch (err: any) {
    if (err.code === "ENOENT") {
      log.error(`File not found: ${filePath}`);
      process.exit(1);
    }
    throw err;
  }

  // Write backup
  writeFileSync(backupPath, source, "utf8");
  log.info(`Backup written to ${backupPath}`);

  const migrated = migrateSource(source);

  if (migrated === source) {
    log.info("File is already v2 — no changes needed.");
    return;
  }

  writeFileSync(filePath, migrated, "utf8");
  log.info(`Migrated ${filePath} to v2 DSL syntax.`);
  log.info(
    "Review the changes, then run `vasp validate` to check for any issues.",
  );
}
