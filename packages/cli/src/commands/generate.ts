import { generate } from "@vasp-framework/generator";
import { Manifest, computeHash } from "@vasp-framework/generator";
import type { VaspPlugin } from "@vasp-framework/core";
import { parse } from "@vasp-framework/parser";
import { join, resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { log } from "../utils/logger.js";
import { handleParseError } from "../utils/parse-error.js";
import { resolveTemplateDir } from "../utils/template-dir.js";
import pc from "picocolors";

/** A filter spec parsed from a `--only type:Name` argument. */
export interface OnlyFilter {
  /** Block type: entity, crud, query, action, job, storage, email, realtime, auth, admin, route, page */
  type: string;
  /** Optional block name (PascalCase as written in the .vasp file). Null means "all of this type". */
  name: string | null;
}

interface GenerateOptions {
  force: boolean;
  dryRun: boolean;
  diff: boolean;
  only: OnlyFilter[];
}

export interface RegenerateResult {
  success: boolean;
  added: number;
  updated: number;
  skipped: number;
  errors: string[];
  warnings: string[];
}

/**
 * Attempt to load a `vasp.config.ts` or `vasp.config.js` file from the
 * project root and extract the `plugins` array.
 * Returns an empty array when no config file is found or when the file does
 * not export a `plugins` property.
 */
async function loadPlugins(projectDir: string): Promise<VaspPlugin[]> {
  const candidates = [
    join(projectDir, "vasp.config.ts"),
    join(projectDir, "vasp.config.js"),
  ];

  for (const configPath of candidates) {
    if (!existsSync(configPath)) continue;
    try {
      // Dynamic import works in both Bun (which resolves .ts natively) and Node.
      // pathToFileURL handles Windows backslashes and special characters correctly.
      const mod = await import(pathToFileURL(configPath).href);
      const config = mod.default ?? mod;
      if (config && Array.isArray(config.plugins)) {
        return config.plugins as VaspPlugin[];
      }
      return [];
    } catch (err) {
      log.warn(`Failed to load ${configPath}: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  return [];
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
  const vaspFile = join(projectDir, "main.vasp");

  let source: string;
  try {
    source = readFileSync(vaspFile, "utf8");
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return {
        success: false,
        added: 0,
        updated: 0,
        skipped: 0,
        errors: ["main.vasp not found"],
        warnings: [],
      };
    }
    throw err;
  }

  let ast;
  try {
    ast = parse(source, "main.vasp");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, added: 0, updated: 0, skipped: 0, errors: [msg], warnings: [] };
  }

  const previousManifest = Manifest.load(projectDir);
  const templateDir = resolveTemplateDir(import.meta.dirname);
  const plugins = await loadPlugins(projectDir);

  const result = generate(ast, {
    outputDir: projectDir,
    templateDir,
    logLevel: force ? "info" : "silent",
    plugins,
  });

  if (!result.success) {
    return {
      success: false,
      added: 0,
      updated: 0,
      skipped: 0,
      errors: result.errors,
      warnings: result.warnings,
    };
  }

  const stats = computeDiff(previousManifest, result.filesWritten, projectDir);
  return { success: true, errors: [], warnings: result.warnings, ...stats };
}

/**
 * `vasp generate` — regenerate the app from main.vasp, preserving user-modified files.
 *
 * The manifest stored in `.vasp/manifest.json` tracks the hash of every generated file.
 * A file is considered "user-modified" when the on-disk content differs from the
 * last-generated hash. User-modified files are skipped unless --force is passed.
 *
 * Flags:
 *   --dry-run           Show what would change without writing any files.
 *   --diff              Show a git-style unified diff of what would change.
 *   --only type:Name…   Regenerate only the outputs of specific blocks.
 *   --force / -f        Overwrite user-modified files.
 */
export async function generateCommand(args: string[]): Promise<void> {
  const opts = parseOptions(args);
  const projectDir = resolve(process.cwd());
  const vaspFile = join(projectDir, "main.vasp");

  let source: string;
  try {
    source = readFileSync(vaspFile, "utf8");
  } catch (err: any) {
    if (err.code === "ENOENT") {
      log.error(
        `No main.vasp found in ${projectDir}. Run 'vasp generate' from your project root.`,
      );
      process.exit(1);
    }
    throw err;
  }

  let ast;
  try {
    ast = parse(source, "main.vasp");
  } catch (err) {
    handleParseError(err, source, "main.vasp");
  }

  // Load previous manifest to detect user-modified files
  const previousManifest = Manifest.load(projectDir);

  if (!previousManifest) {
    log.warn(
      "No manifest found — this looks like a fresh app. Use vasp new instead.",
    );
    log.warn("Running full generation anyway...");
  }

  // Load plugins from vasp.config.{ts,js} once; thread them through all sub-commands.
  const plugins = await loadPlugins(projectDir);
  if (plugins.length > 0) {
    log.dim(`  Loaded ${plugins.length} plugin(s): ${plugins.map((p) => p.name).join(", ")}`);
  }

  if (opts.dryRun) {
    log.step("[dry-run] vasp generate — showing what would change");
    await runDryRun(ast, projectDir, previousManifest, opts, plugins);
    return;
  }

  if (opts.diff) {
    log.step("[diff] vasp generate — showing changes as unified diff");
    await runDiff(ast, projectDir, previousManifest, plugins);
    return;
  }

  if (opts.only.length > 0) {
    await runOnly(ast, projectDir, opts.only, previousManifest, opts.force, plugins);
    return;
  }

  if (previousManifest && !opts.force) {
    const skipped = detectUserModifiedFiles(projectDir, previousManifest);
    if (skipped.length > 0) {
      log.step("Skipping user-modified files (run with --force to overwrite):");
      for (const f of skipped) log.dim(`  skip  ${f}`);
    }
  }

  log.step("Regenerating app...");

  const result = await runRegenerate(projectDir, opts.force);

  if (!result.success) {
    log.error("Generation failed:");
    for (const err of result.errors) log.error(err);
    process.exit(1);
  }

  log.success(
    `Done: ${result.added} added, ${result.updated} updated, ${result.skipped} skipped`,
  );

  if (result.skipped > 0 && !opts.force) {
    log.dim(
      `  ${result.skipped} user-modified file(s) preserved — use --force to overwrite`,
    );
  }

  if (result.warnings.length > 0) {
    console.log();
    log.warn("⚠ Destructive schema changes detected:");
    for (const w of result.warnings) {
      log.warn(`  ${w}`);
    }
    log.warn('Review these changes carefully before running "vasp db push".');
    log.warn('Consider using a migration instead: vasp db generate && vasp db migrate');
  }
}

function detectUserModifiedFiles(
  projectDir: string,
  manifest: Manifest,
): string[] {
  const modified: string[] = [];
  for (const [relPath, entry] of Object.entries(manifest.files)) {
    // Never skip src/ files — those are always user-owned
    if (relPath.startsWith("src/")) continue;
    const fullPath = join(projectDir, relPath);
    let onDisk: string;
    try {
      onDisk = readFileSync(fullPath, "utf8");
    } catch {
      continue;
    }
    const diskHash = computeHash(onDisk);
    if (diskHash !== entry.hash) {
      modified.push(relPath);
    }
  }
  return modified;
}

function computeDiff(
  previous: Manifest | null,
  filesWritten: string[],
  _projectDir: string,
): { added: number; updated: number; skipped: number } {
  let added = 0;
  let updated = 0;

  for (const f of filesWritten) {
    if (!previous?.hasFile(f)) {
      added++;
    } else {
      updated++;
    }
  }

  const previousCount = previous ? Object.keys(previous.files).length : 0;
  const skipped = Math.max(0, previousCount - filesWritten.length);

  return { added, updated, skipped };
}

async function runDryRun(
  ast: ReturnType<typeof parse>,
  projectDir: string,
  previousManifest: Manifest | null,
  _opts: GenerateOptions,
  plugins: VaspPlugin[] = [],
): Promise<void> {
  const templateDir = resolveTemplateDir(import.meta.dirname);
  const result = generate(ast, {
    outputDir: join(projectDir, ".vasp", "dry-run"),
    templateDir,
    logLevel: "silent",
    plugins,
  });

  if (!result.success) {
    log.error("Dry-run failed");
    process.exit(1);
  }

  let added = 0;
  let updated = 0;
  let preserved = 0;

  for (const f of result.filesWritten) {
    if (!previousManifest?.hasFile(f)) {
      log.info(`  + ${f}`);
      added++;
    } else {
      const fullPath = join(projectDir, f);
      let onDisk: string | undefined;
      try {
        onDisk = readFileSync(fullPath, "utf8");
      } catch {
        // file absent
      }
      if (onDisk !== undefined) {
        const diskHash = computeHash(onDisk);
        const prevHash = previousManifest.getEntry(f)?.hash;
        if (diskHash !== prevHash) {
          log.warn(`  ~ ${f} (user-modified — would skip)`);
          preserved++;
        } else {
          log.dim(`  = ${f}`);
          updated++;
        }
      } else {
        log.info(`  + ${f}`);
        added++;
      }
    }
  }

  log.step(
    `[dry-run] ${added} would be added, ${updated} unchanged, ${preserved} preserved`,
  );

  // Clean up dry-run output dir
  try {
    rmSync(join(projectDir, ".vasp", "dry-run"), {
      recursive: true,
      force: true,
    });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Generate to a staging dir and show a git-style unified diff of what would
 * change compared to the files currently on disk.
 */
async function runDiff(
  ast: ReturnType<typeof parse>,
  projectDir: string,
  previousManifest: Manifest | null,
  plugins: VaspPlugin[] = [],
): Promise<void> {
  const templateDir = resolveTemplateDir(import.meta.dirname);
  const diffDir = join(projectDir, ".vasp", "diff-staging");

  // Clean any leftover staging dir from a previous interrupted run
  rmSync(diffDir, { recursive: true, force: true });

  const result = generate(ast, {
    outputDir: diffDir,
    templateDir,
    logLevel: "silent",
    plugins,
  });

  if (!result.success) {
    rmSync(diffDir, { recursive: true, force: true });
    log.error("Diff generation failed");
    process.exit(1);
  }

  let filesChanged = 0;
  let filesAdded = 0;
  let filesUnchanged = 0;

  for (const relPath of result.filesWritten) {
    const diskPath = join(projectDir, relPath);
    const stagedPath = join(diffDir, relPath);

    let newContent: string;
    try {
      newContent = readFileSync(stagedPath, "utf8");
    } catch {
      continue;
    }

    let oldContent: string | undefined;
    try {
      oldContent = readFileSync(diskPath, "utf8");
    } catch {
      // file absent on disk — treat as new
    }

    if (oldContent === undefined) {
      // New file — show as all additions
      if (!previousManifest?.hasFile(relPath)) {
        const diffText = computeUnifiedDiff("", newContent, relPath);
        if (diffText) {
          console.log(formatDiffOutput(diffText));
          filesAdded++;
        }
      }
    } else {
      if (oldContent === newContent) {
        filesUnchanged++;
      } else {
        const diffText = computeUnifiedDiff(oldContent, newContent, relPath);
        if (diffText) {
          console.log(formatDiffOutput(diffText));
          filesChanged++;
        } else {
          filesUnchanged++;
        }
      }
    }
  }

  log.step(
    `[diff] ${filesAdded} new, ${filesChanged} changed, ${filesUnchanged} unchanged`,
  );

  // Cleanup
  try {
    rmSync(diffDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Regenerate only the outputs of specific blocks (identified by `--only type:Name` filters).
 * Files that don't match the filter are left untouched. User-modified files are preserved
 * unless `--force` is passed.
 */
async function runOnly(
  ast: ReturnType<typeof parse>,
  projectDir: string,
  filters: OnlyFilter[],
  previousManifest: Manifest | null,
  force: boolean,
  plugins: VaspPlugin[] = [],
): Promise<void> {
  const templateDir = resolveTemplateDir(import.meta.dirname);
  const stagingOutputDir = join(projectDir, ".vasp", "only-staging");

  // Clean any leftover staging dir
  rmSync(stagingOutputDir, { recursive: true, force: true });

  const result = generate(ast, {
    outputDir: stagingOutputDir,
    templateDir,
    logLevel: "silent",
    plugins,
  });

  if (!result.success) {
    rmSync(stagingOutputDir, { recursive: true, force: true });
    log.error("Generation failed:");
    for (const err of result.errors) log.error(err);
    process.exit(1);
  }

  // Load staging manifest (contains entries for all generated files)
  const stagingManifest = Manifest.load(stagingOutputDir);

  // Filter to files that match the --only specs
  const matched = result.filesWritten.filter((f) =>
    fileMatchesOnlyFilters(f, filters),
  );

  const filterDesc = filters
    .map((f) => `${f.type}${f.name ? `:${f.name}` : ""}`)
    .join(", ");

  if (matched.length === 0) {
    log.warn(`No generated files matched the --only filter: ${filterDesc}`);
    rmSync(stagingOutputDir, { recursive: true, force: true });
    return;
  }

  log.step(`Regenerating ${matched.length} file(s) matching: ${filterDesc}`);

  let copied = 0;
  let skipped = 0;

  for (const relPath of matched) {
    const diskPath = join(projectDir, relPath);

    // Preserve user-modified files unless --force
    if (!force && previousManifest) {
      let onDisk: string | undefined;
      try {
        onDisk = readFileSync(diskPath, "utf8");
      } catch {
        // file absent — treat as unmodified
      }
      if (onDisk !== undefined) {
        const diskHash = computeHash(onDisk);
        const prevEntry = previousManifest.getEntry(relPath);
        if (prevEntry && diskHash !== prevEntry.hash) {
          log.warn(
            `  ~ ${relPath} (user-modified — skipping; use --force to overwrite)`,
          );
          skipped++;
          continue;
        }
      }
    }

    const srcPath = join(stagingOutputDir, relPath);
    mkdirSync(dirname(diskPath), { recursive: true });
    try {
      copyFileSync(srcPath, diskPath);
    } catch {
      continue;
    }
    log.info(`  ✓ ${relPath}`);
    copied++;
  }

  // Update project manifest: keep existing entries, update only for copied files
  if (stagingManifest) {
    const projectManifest =
      previousManifest ?? new Manifest(stagingManifest.version);
    for (const relPath of matched) {
      const stagingEntry = stagingManifest.getEntry(relPath);
      if (stagingEntry) {
        projectManifest.setEntry(relPath, stagingEntry);
      }
    }
    projectManifest.save(projectDir);
  }

  log.success(
    `Done: ${copied} file(s) updated${skipped > 0 ? `, ${skipped} preserved` : ""}`,
  );

  if (skipped > 0 && !force) {
    log.dim(
      `  ${skipped} user-modified file(s) preserved — use --force to overwrite`,
    );
  }

  // Cleanup
  try {
    rmSync(stagingOutputDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Returns true if `relPath` matches any of the `--only` filter specs.
 * Uses known file-path conventions from each generator.
 */
export function fileMatchesOnlyFilters(
  relPath: string,
  filters: OnlyFilter[],
): boolean {
  if (filters.length === 0) return true;
  return filters.some((filter) => {
    const pathName = filter.name ? blockNameToPath(filter.name) : null;
    switch (filter.type) {
      case "entity":
        // DrizzleSchemaGenerator writes server/db/schema.* and server/db/drizzle.config.*
        return relPath.startsWith("server/db/");

      case "crud":
        // CrudGenerator writes server/routes/crud/<camelName>.* and src/vasp/client/crud.*
        if (pathName) {
          return (
            relPath.startsWith(`server/routes/crud/${pathName}.`) ||
            relPath.startsWith("src/vasp/client/crud.")
          );
        }
        return (
          relPath.startsWith("server/routes/crud/") ||
          relPath.startsWith("src/vasp/client/crud.")
        );

      case "query":
        // QueryActionGenerator writes server/routes/queries/<camelName>.*
        if (pathName) {
          return relPath.startsWith(`server/routes/queries/${pathName}.`);
        }
        return relPath.startsWith("server/routes/queries/");

      case "action":
        // QueryActionGenerator writes server/routes/actions/<camelName>.*
        if (pathName) {
          return relPath.startsWith(`server/routes/actions/${pathName}.`);
        }
        return relPath.startsWith("server/routes/actions/");

      case "job":
        // JobGenerator writes server/jobs/<camelName>.*
        if (pathName) {
          return relPath.startsWith(`server/jobs/${pathName}.`);
        }
        return relPath.startsWith("server/jobs/");

      case "storage":
        // StorageGenerator writes server/routes/storage/<camelName>.* and server/storage/*
        if (pathName) {
          return relPath.startsWith(`server/routes/storage/${pathName}.`);
        }
        return (
          relPath.startsWith("server/routes/storage/") ||
          relPath.startsWith("server/storage/")
        );

      case "email":
        // EmailGenerator writes server/email/*
        return relPath.startsWith("server/email/");

      case "realtime":
        // RealtimeGenerator writes server/routes/realtime/*
        if (pathName) {
          return relPath.startsWith(`server/routes/realtime/${pathName}.`);
        }
        return relPath.startsWith("server/routes/realtime/");

      case "auth":
        // AuthGenerator writes server/auth/** and Login/Register components
        return (
          relPath.startsWith("server/auth/") ||
          relPath.includes("/Login.") ||
          relPath.includes("/Register.")
        );

      case "admin":
        // AdminGenerator writes admin/**
        return relPath.startsWith("admin/");

      case "route":
      case "page":
        // FrontendGenerator writes src/**
        return relPath.startsWith("src/");

      default:
        return false;
    }
  });
}

/**
 * Convert a PascalCase block name to the camelCase path segment used in generated file names.
 * Mirrors the logic in TemplateEngine.toCamelCase.
 */
function blockNameToPath(name: string): string {
  return name
    .replace(/[-_\s]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^./, (c) => c.toLowerCase());
}

// ---------------------------------------------------------------------------
// Unified diff computation
// ---------------------------------------------------------------------------

type EditOp = "equal" | "insert" | "delete";
interface Edit {
  op: EditOp;
  line: string;
}
interface DiffHunk {
  oldStart: number;
  newStart: number;
  lines: string[];
}

/**
 * Compute a git-style unified diff between two text contents.
 * Returns an empty string if the contents are identical.
 * Exported for testing.
 */
export function computeUnifiedDiff(
  oldText: string,
  newText: string,
  filePath: string,
  context = 3,
): string {
  if (oldText === newText) return "";

  const oldLines = oldText === "" ? [] : oldText.split("\n");
  const newLines = newText === "" ? [] : newText.split("\n");

  const edits = lcsDiff(oldLines, newLines);
  const hunks = buildHunks(edits, context);

  if (hunks.length === 0) return "";

  const output: string[] = [`--- a/${filePath}`, `+++ b/${filePath}`];

  for (const hunk of hunks) {
    const oldCount = hunk.lines.filter((l) => l[0] !== "+").length;
    const newCount = hunk.lines.filter((l) => l[0] !== "-").length;
    output.push(
      `@@ -${hunk.oldStart},${oldCount} +${hunk.newStart},${newCount} @@`,
    );
    output.push(...hunk.lines);
  }

  return output.join("\n");
}

/**
 * Colorize a unified diff string for terminal display.
 */
function formatDiffOutput(diff: string): string {
  return diff
    .split("\n")
    .map((line) => {
      if (line.startsWith("---") || line.startsWith("+++")) {
        return pc.bold(line);
      }
      if (line.startsWith("@@")) {
        return pc.cyan(line);
      }
      if (line.startsWith("+")) {
        return pc.green(line);
      }
      if (line.startsWith("-")) {
        return pc.red(line);
      }
      return pc.dim(line);
    })
    .join("\n");
}

/** Compute edit operations using LCS (Longest Common Subsequence). */
function lcsDiff(oldLines: string[], newLines: string[]): Edit[] {
  const m = oldLines.length;
  const n = newLines.length;

  // Build LCS DP table
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const row = dp[i] as number[];
      const prevRow = dp[i - 1] as number[];
      if (oldLines[i - 1] === newLines[j - 1]) {
        row[j] = (prevRow[j - 1] as number) + 1;
      } else {
        row[j] = Math.max(prevRow[j] as number, row[j - 1] as number);
      }
    }
  }

  // Backtrack to reconstruct edit sequence
  const edits: Edit[] = [];
  let i = m,
    j = n;
  while (i > 0 || j > 0) {
    // Safe: bounds are validated by loop conditions (i > 0 ensures i-1 >= 0, etc.)
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      edits.push({ op: "equal", line: oldLines[i - 1] as string });
      i--;
      j--;
    } else if (
      j > 0 &&
      (i === 0 ||
        ((dp[i] as number[])[j - 1] as number) >=
          ((dp[i - 1] as number[])[j] as number))
    ) {
      edits.push({ op: "insert", line: newLines[j - 1] as string });
      j--;
    } else {
      edits.push({ op: "delete", line: oldLines[i - 1] as string });
      i--;
    }
  }

  return edits.reverse();
}

/** Group edit operations into unified-diff hunks with `context` surrounding lines. */
function buildHunks(edits: Edit[], context: number): DiffHunk[] {
  // Find indices of non-equal edits
  const changeIndices: number[] = [];
  for (let idx = 0; idx < edits.length; idx++) {
    if ((edits[idx] as Edit).op !== "equal") changeIndices.push(idx);
  }

  if (changeIndices.length === 0) return [];

  // Group change indices into contiguous ranges (merging nearby changes)
  const ranges: [number, number][] = [];
  let rangeStart = Math.max(0, (changeIndices[0] as number) - context);
  let rangeEnd = Math.min(
    edits.length - 1,
    (changeIndices[0] as number) + context,
  );

  for (let k = 1; k < changeIndices.length; k++) {
    const ci = changeIndices[k] as number;
    const start = Math.max(0, ci - context);
    const end = Math.min(edits.length - 1, ci + context);

    if (start <= rangeEnd + 1) {
      // Overlapping or adjacent — merge
      rangeEnd = end;
    } else {
      ranges.push([rangeStart, rangeEnd]);
      rangeStart = start;
      rangeEnd = end;
    }
  }
  ranges.push([rangeStart, rangeEnd]);

  // Build hunk objects
  const hunks: DiffHunk[] = [];
  for (const range of ranges) {
    const [start, end] = range as [number, number];
    // Compute 1-based starting line numbers for old and new files
    let oldLine = 1;
    let newLine = 1;
    for (let idx = 0; idx < start; idx++) {
      const edit = edits[idx] as Edit;
      if (edit.op !== "insert") oldLine++;
      if (edit.op !== "delete") newLine++;
    }

    const hunkLines: string[] = [];
    for (let idx = start; idx <= end; idx++) {
      const { op, line } = edits[idx] as Edit;
      if (op === "equal") hunkLines.push(` ${line}`);
      else if (op === "insert") hunkLines.push(`+${line}`);
      else hunkLines.push(`-${line}`);
    }

    hunks.push({ oldStart: oldLine, newStart: newLine, lines: hunkLines });
  }

  return hunks;
}

function parseOptions(args: string[]): GenerateOptions {
  const only: OnlyFilter[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--only") {
      // Collect all values after --only that don't start with '-'
      let j = i + 1;
      while (j < args.length && !(args[j] as string).startsWith("-")) {
        const spec = args[j] as string;
        const colonIdx = spec.indexOf(":");
        if (colonIdx !== -1) {
          only.push({
            type: spec.slice(0, colonIdx).toLowerCase(),
            name: spec.slice(colonIdx + 1) || null,
          });
        } else {
          only.push({ type: spec.toLowerCase(), name: null });
        }
        j++;
      }
    }
  }

  return {
    force: args.includes("--force") || args.includes("-f"),
    dryRun: args.includes("--dry-run"),
    diff: args.includes("--diff"),
    only,
  };
}
