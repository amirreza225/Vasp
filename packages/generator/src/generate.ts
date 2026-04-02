import type {
  GeneratorOptions,
  GeneratorResult,
  VaspAST,
  VaspPlugin,
} from "@vasp-framework/core";
import { VASP_VERSION } from "@vasp-framework/core";
import { createConsoleLogger, createContext } from "./GeneratorContext.js";
import { AdminGenerator } from "./generators/AdminGenerator.js";
import { AuthGenerator } from "./generators/AuthGenerator.js";
import { ApiGenerator } from "./generators/ApiGenerator.js";
import { AutoPageGenerator } from "./generators/AutoPageGenerator.js";
import { BackendGenerator } from "./generators/BackendGenerator.js";
import { CacheGenerator } from "./generators/CacheGenerator.js";
import { CrudGenerator } from "./generators/CrudGenerator.js";
import { DrizzleSchemaGenerator } from "./generators/DrizzleSchemaGenerator.js";
import { EmailGenerator } from "./generators/EmailGenerator.js";
import { FrontendGenerator } from "./generators/FrontendGenerator.js";
import { JobGenerator } from "./generators/JobGenerator.js";
import { MiddlewareGenerator } from "./generators/MiddlewareGenerator.js";
import { ObservabilityGenerator } from "./generators/ObservabilityGenerator.js";
import { QueryActionGenerator } from "./generators/QueryActionGenerator.js";
import { RealtimeGenerator } from "./generators/RealtimeGenerator.js";
import { ScaffoldGenerator } from "./generators/ScaffoldGenerator.js";
import { SeedGenerator } from "./generators/SeedGenerator.js";
import { StorageGenerator } from "./generators/StorageGenerator.js";
import { WebhookGenerator } from "./generators/WebhookGenerator.js";
import { computeHash, Manifest } from "./manifest/Manifest.js";
import type { FieldSnapshot, SchemaSnapshot } from "./manifest/Manifest.js";
import { TemplateEngine } from "./template/TemplateEngine.js";
import {
  cleanupDir,
  commitStagedFiles,
  deleteOrphanedFiles,
  writeFile,
} from "./utils/fs.js";
import { dirname, join, resolve, normalize } from "node:path";
import { mkdirSync, existsSync, rmSync } from "node:fs";

// ---------------------------------------------------------------------------
// Incremental generation helpers
// ---------------------------------------------------------------------------

/**
 * Compute a per-block-group JSON fingerprint of the AST.
 * Each entry maps a block key to the SHA-256 hash of its JSON representation.
 * Used to detect which block types changed between two generation runs.
 */
function computeAstSnapshot(ast: VaspAST): Record<string, string> {
  const h = (val: unknown): string => computeHash(JSON.stringify(val ?? null));
  return {
    app: h(ast.app),
    auth: h(ast.auth),
    entities: h(ast.entities),
    routes: h(ast.routes),
    pages: h(ast.pages),
    queries: h(ast.queries),
    actions: h(ast.actions),
    cruds: h(ast.cruds),
    realtimes: h(ast.realtimes),
    jobs: h(ast.jobs),
    apis: h(ast.apis),
    middlewares: h(ast.middlewares),
    storages: h(ast.storages),
    emails: h(ast.emails),
    admin: h(ast.admin),
    seed: h(ast.seed),
    caches: h(ast.caches),
    webhooks: h(ast.webhooks),
    observability: h(ast.observability),
    autoPages: h(ast.autoPages),
  };
}

/**
 * Maps each generator name to the AST block keys (from computeAstSnapshot) it
 * depends on.  A generator is (re-)run only when at least one of its
 * dependencies has a different hash from the previous generation.
 *
 * Maintenance: keep in sync with the generator execution order in generate().
 */
const GENERATOR_DEPS: Readonly<Record<string, readonly string[]>> = {
  ScaffoldGenerator: ["app"],
  DrizzleSchemaGenerator: ["entities", "auth"],
  BackendGenerator: [
    "app",
    "auth",
    "entities",
    "middlewares",
    "queries",
    "actions",
    "cruds",
    "jobs",
    "storages",
    "emails",
    "caches",
    "webhooks",
    "observability",
    "apis",
    "seed",
  ],
  ObservabilityGenerator: ["observability", "app"],
  AuthGenerator: ["auth", "entities"],
  MiddlewareGenerator: ["middlewares"],
  CacheGenerator: ["caches", "app"],
  QueryActionGenerator: ["queries", "actions", "emails"],
  ApiGenerator: ["apis"],
  CrudGenerator: ["cruds", "entities", "auth"],
  RealtimeGenerator: ["realtimes", "cruds"],
  AutoPageGenerator: ["autoPages", "entities", "app"],
  JobGenerator: ["jobs", "app"],
  EmailGenerator: ["emails", "app"],
  SeedGenerator: ["seed"],
  StorageGenerator: ["storages", "entities"],
  WebhookGenerator: ["webhooks", "entities", "cruds", "jobs"],
  FrontendGenerator: [
    "app",
    "routes",
    "pages",
    "auth",
    "queries",
    "actions",
    "cruds",
    "autoPages",
    "entities",
  ],
  AdminGenerator: ["admin", "entities"],
};

/**
 * Return the set of block-type keys whose content changed between the previous
 * and next AST snapshots (added, removed, or hash-changed).
 */
function changedBlocks(
  prev: Record<string, string>,
  next: Record<string, string>,
): Set<string> {
  const changed = new Set<string>();
  const allKeys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const key of allKeys) {
    if (prev[key] !== next[key]) changed.add(key);
  }
  return changed;
}

/**
 * Return the set of generator names that must run given the changed block types.
 * A generator runs if ANY of its block-type dependencies appear in `changed`.
 */
function generatorsToRun(changed: Set<string>): Set<string> {
  const toRun = new Set<string>();
  for (const [name, deps] of Object.entries(GENERATOR_DEPS)) {
    if (deps.some((d) => changed.has(d))) toRun.add(name);
  }
  return toRun;
}

export function generate(
  ast: VaspAST,
  opts: GeneratorOptions,
): GeneratorResult {
  const logger = createConsoleLogger(opts.logLevel ?? "info");
  const realOutputDir = opts.outputDir;
  const stagingDir = join(
    dirname(realOutputDir),
    `.vasp-staging-${Date.now()}`,
  );

  // Load the previous manifest now — before the staging run — so we can diff
  // old vs new after committing and delete any orphaned generated files.
  const previousManifest = Manifest.load(realOutputDir);

  mkdirSync(stagingDir, { recursive: true });

  const ctx = createContext(ast, stagingDir, {
    projectDir: realOutputDir,
    ...(opts.templateDir !== undefined
      ? { templateDir: opts.templateDir }
      : {}),
    logger,
  });

  let engine: TemplateEngine;
  if (opts.engine instanceof TemplateEngine) {
    engine = opts.engine;
  } else {
    engine = new TemplateEngine();
    engine.loadDirectory(ctx.templateDir);
  }

  // Apply plugin contributions before any template is rendered.
  // 1. Register custom helpers first so they are available in overridden templates.
  // 2. Apply template overrides after directory load so they take precedence.
  const plugins: VaspPlugin[] = opts.plugins ?? [];
  for (const plugin of plugins) {
    if (plugin.helpers) {
      for (const [name, fn] of Object.entries(plugin.helpers)) {
        engine.registerHelper(name, fn);
        logger.verbose(`[plugin:${plugin.name}] registered helper '${name}'`);
      }
    }
    if (plugin.templateOverrides) {
      for (const [key, source] of Object.entries(plugin.templateOverrides)) {
        engine.applyTemplateOverride(key, source);
        logger.verbose(`[plugin:${plugin.name}] overrode template '${key}'`);
      }
    }
  }

  const filesWritten: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const manifest = new Manifest(VASP_VERSION);

  // Check for potentially-destructive schema changes before committing any files.
  // We compare the previous manifest's schema snapshot (what was generated last time)
  // against the current AST (what we are about to generate).
  if (previousManifest) {
    const previousSnapshot = previousManifest.getSchemaSnapshot();
    if (previousSnapshot) {
      const destructiveWarnings = detectDestructiveSchemaChanges(
        previousSnapshot,
        ast,
      );
      warnings.push(...destructiveWarnings);
    }
  }

  // Compute the AST snapshot for incremental generation.
  // Compare against the previous snapshot to determine which block types changed.
  const newAstSnapshot = computeAstSnapshot(ast);
  // null = run all generators; Set = run only the listed generators
  let generatorFilter: Set<string> | null = null;
  if (previousManifest) {
    const prevAstSnapshot = previousManifest.getAstSnapshot();
    if (prevAstSnapshot) {
      const changed = changedBlocks(prevAstSnapshot, newAstSnapshot);
      generatorFilter = generatorsToRun(changed);
      if (generatorFilter.size === 0) {
        logger.info("↷ No block types changed — skipping all generators");
      } else {
        const skippedCount =
          Object.keys(GENERATOR_DEPS).length - generatorFilter.size;
        if (skippedCount > 0) {
          logger.verbose(
            `↷ Skipping ${skippedCount} generator(s) whose block types are unchanged`,
          );
        }
      }
    }
    // If prevAstSnapshot is absent (old manifest format), generatorFilter stays
    // null and all generators run (safe fallback).
  }

  // Helper: run a generator and collect its error without aborting the pipeline.
  // When generatorFilter is set, generators not in the filter are silently skipped.
  function runGenerator(name: string, run: () => void): void {
    if (generatorFilter !== null && !generatorFilter.has(name)) {
      logger.verbose(`↷ Skipped ${name} (block types unchanged)`);
      return;
    }
    try {
      run();
    } catch (err) {
      const message = `[${name}] ${err instanceof Error ? err.message : String(err)}`;
      logger.error(message);
      errors.push(message);
    }
  }

  try {
    // Execute generators in dependency order (all writes go to staging dir).
    // Each generator is isolated so a single failure does not abort the rest.
    runGenerator("ScaffoldGenerator", () =>
      new ScaffoldGenerator(ctx, engine, filesWritten, manifest).run(),
    );
    runGenerator("DrizzleSchemaGenerator", () =>
      new DrizzleSchemaGenerator(ctx, engine, filesWritten, manifest).run(),
    );
    runGenerator("BackendGenerator", () =>
      new BackendGenerator(ctx, engine, filesWritten, manifest).run(),
    );
    runGenerator("ObservabilityGenerator", () =>
      new ObservabilityGenerator(ctx, engine, filesWritten, manifest).run(),
    );
    runGenerator("AuthGenerator", () =>
      new AuthGenerator(ctx, engine, filesWritten, manifest).run(),
    );
    runGenerator("MiddlewareGenerator", () =>
      new MiddlewareGenerator(ctx, engine, filesWritten, manifest).run(),
    );
    runGenerator("CacheGenerator", () =>
      new CacheGenerator(ctx, engine, filesWritten, manifest).run(),
    );
    runGenerator("QueryActionGenerator", () =>
      new QueryActionGenerator(ctx, engine, filesWritten, manifest).run(),
    );
    runGenerator("ApiGenerator", () =>
      new ApiGenerator(ctx, engine, filesWritten, manifest).run(),
    );
    runGenerator("CrudGenerator", () =>
      new CrudGenerator(ctx, engine, filesWritten, manifest).run(),
    );
    runGenerator("RealtimeGenerator", () =>
      new RealtimeGenerator(ctx, engine, filesWritten, manifest).run(),
    );
    runGenerator("AutoPageGenerator", () =>
      new AutoPageGenerator(ctx, engine, filesWritten, manifest).run(),
    );
    runGenerator("JobGenerator", () =>
      new JobGenerator(ctx, engine, filesWritten, manifest).run(),
    );
    runGenerator("EmailGenerator", () =>
      new EmailGenerator(ctx, engine, filesWritten, manifest).run(),
    );
    runGenerator("SeedGenerator", () =>
      new SeedGenerator(ctx, engine, filesWritten, manifest).run(),
    );
    runGenerator("StorageGenerator", () =>
      new StorageGenerator(ctx, engine, filesWritten, manifest).run(),
    );
    runGenerator("WebhookGenerator", () =>
      new WebhookGenerator(ctx, engine, filesWritten, manifest).run(),
    );
    runGenerator("FrontendGenerator", () =>
      new FrontendGenerator(ctx, engine, filesWritten, manifest).run(),
    );
    runGenerator("AdminGenerator", () =>
      new AdminGenerator(ctx, engine, filesWritten, manifest).run(),
    );

    // Run plugin generators after all built-in generators have completed.
    // Each plugin generator receives a read-only context subset and a write callback
    // that records the file in the manifest so orphan-deletion stays consistent.
    if (plugins.length > 0) {
      const pluginCtx = {
        ast,
        projectDir: ctx.projectDir,
        isTypeScript: ctx.isTypeScript,
        isSsr: ctx.isSsr,
        isSsg: ctx.isSsg,
        isSpa: ctx.isSpa,
        ext: ctx.ext,
      } as const;

      for (const plugin of plugins) {
        if (!plugin.generators?.length) continue;
        for (const gen of plugin.generators) {
          const generatorLabel = `plugin:${plugin.name}/${gen.name}`;
          try {
            gen.run(pluginCtx, (relativePath, content) => {
              // Guard against path-traversal: the resolved path must stay inside
              // the staging directory (ctx.outputDir).
              const fullPath = resolve(ctx.outputDir, normalize(relativePath));
              if (
                !fullPath.startsWith(ctx.outputDir + "/") &&
                fullPath !== ctx.outputDir
              ) {
                throw new Error(
                  `Plugin '${plugin.name}' tried to write outside the output directory: '${relativePath}'`,
                );
              }
              writeFile(fullPath, content);
              filesWritten.push(relativePath);
              manifest.record(relativePath, content, generatorLabel);
              logger.verbose(`  write ${relativePath}`);
            });
            logger.verbose(`✓ ${generatorLabel}`);
          } catch (err) {
            const message = `[${generatorLabel}] ${err instanceof Error ? err.message : String(err)}`;
            logger.error(message);
            errors.push(message);
          }
        }
      }
    }

    // If any generator reported an error, abort without touching the real output dir.
    if (errors.length > 0) {
      cleanupDir(stagingDir);
      return { success: false, filesWritten, errors, warnings };
    }

    // Propagate manifest entries from skipped generators into the new manifest.
    // Without this, deleteOrphanedFiles would consider their still-valid files
    // as orphaned and delete them on the next run.
    let reusedFileCount = 0;
    if (previousManifest && generatorFilter !== null) {
      const skippedGenerators = new Set(
        Object.keys(GENERATOR_DEPS).filter((n) => !generatorFilter!.has(n)),
      );
      for (const [relPath, entry] of Object.entries(previousManifest.files)) {
        if (
          skippedGenerators.has(entry.generator) &&
          !manifest.hasFile(relPath)
        ) {
          manifest.setEntry(relPath, entry);
          reusedFileCount++;
        }
      }
    }

    // All generators succeeded — commit staged files to real output dir.
    // .env is preserved if the existing one has non-placeholder values.
    // Unchanged files (same SHA-256) are skipped to avoid spurious mtime changes
    // and Vite HMR triggers.
    commitStagedFiles(stagingDir, realOutputDir, { preserveEnv: true });

    // Delete any files that were tracked in the previous manifest but are no
    // longer generated (e.g. a crud/query/action block was removed). Only
    // unmodified files (hash matches the old manifest) are removed so that
    // user-edited files are never silently deleted.
    if (previousManifest) {
      const orphaned = deleteOrphanedFiles(
        previousManifest,
        manifest,
        realOutputDir,
      );
      if (orphaned.length > 0) {
        logger.info(`✓ Deleted ${orphaned.length} orphaned file(s)`);
      }
    }

    // Remove stale counterpart router file from the real output dir.
    // Vite resolves '.js' imports literally, so if both index.js and index.ts
    // exist, the explicit .js import in main.ts wins and the generated file is ignored.
    const ext = ast.app!.typescript ? "ts" : "js";
    const staleRouterExt = ext === "ts" ? "js" : "ts";
    const staleRouterPath = join(
      realOutputDir,
      `src/router/index.${staleRouterExt}`,
    );
    if (existsSync(staleRouterPath)) {
      rmSync(staleRouterPath);
    }

    // Remove stale mode-specific root config files when the app mode has changed.
    //
    // Scenario: `vasp new` scaffolds a SPA (default) and writes vite.config.js + index.html.
    // Later, `vasp generate --force` regenerates the same directory as SSR/SSG — it writes
    // nuxt.config.{ext} but cannot remove the old vite.config.js via staging alone because
    // commitStagedFiles only adds/updates files, it never deletes from the real output dir.
    // Nuxt 4 explicitly warns when it finds a vite.config.* in the project root:
    //   "Using vite.config.js is not supported together with Nuxt."
    const isSsrMode = ast.app!.ssr === true || ast.app!.ssr === "ssg";
    if (isSsrMode) {
      // SPA artifacts that are invalid in an SSR/SSG project
      for (const stale of ["vite.config.js", "vite.config.ts", "index.html"]) {
        const p = join(realOutputDir, stale);
        if (existsSync(p)) rmSync(p);
      }
    } else {
      // SSR/SSG artifacts that are invalid in a SPA project
      for (const stale of ["nuxt.config.js", "nuxt.config.ts"]) {
        const p = join(realOutputDir, stale);
        if (existsSync(p)) rmSync(p);
      }
    }

    // Persist manifest (with updated AST snapshot) to real output dir.
    manifest.setAstSnapshot(newAstSnapshot);
    manifest.save(realOutputDir);

    // Clean up staging dir
    cleanupDir(stagingDir);

    if (reusedFileCount > 0) {
      logger.verbose(
        `↷ Reused ${reusedFileCount} file(s) from previous generation`,
      );
    }
    logger.info(`✓ Generated ${filesWritten.length} file(s)`);

    return { success: true, filesWritten, errors: [], warnings };
  } catch (err) {
    // Infrastructure-level failure (staging dir setup, template loading, etc.).
    // This catch is only reached when errors.length === 0 because any per-generator
    // failure already triggers an early return above.  We therefore push exactly
    // one new error (the infrastructure error) with no risk of duplication.
    cleanupDir(stagingDir);
    const message = err instanceof Error ? err.message : String(err);
    logger.error(message);
    errors.push(message);
    return { success: false, filesWritten, errors, warnings };
  }
}

/**
 * Compare the Drizzle schema snapshot from the previous generation against the
 * current AST and return human-readable warning messages for any changes that
 * would cause `vasp db push` / Drizzle to **drop** or **alter** existing data:
 *
 *   - Table dropped (entity removed from the DSL)
 *   - Column dropped or renamed (field removed — rename = drop + add in Drizzle)
 *   - Column type changed (may require lossy casting or fail entirely)
 *   - Column changed from nullable to NOT NULL (fails if NULL rows exist)
 *   - New UNIQUE constraint on an existing column (fails if duplicates exist)
 *   - Enum value removed (existing rows violate the constraint)
 *   - Table-level composite UNIQUE constraint added (fails if duplicate combos exist)
 *   - Index type changed on same fields (drop + recreate, slow on large tables)
 *
 * Exported so it can be unit-tested directly without running a full generation.
 */
export function detectDestructiveSchemaChanges(
  previousSnapshot: SchemaSnapshot,
  ast: VaspAST,
): string[] {
  const warnings: string[] = [];

  // Build a lookup of current entity → field name → field for O(1) checks
  const currentEntityMap = new Map(ast.entities.map((e) => [e.name, e]));

  const RESERVED = new Set(["createdAt", "updatedAt"]);

  for (const [entityName, entitySnap] of Object.entries(
    previousSnapshot.entities,
  )) {
    const currentEntity = currentEntityMap.get(entityName);

    if (!currentEntity) {
      warnings.push(
        `Destructive schema change: entity '${entityName}' was removed.` +
          ` Running 'vasp db push' will DROP the '${entityName}' table and destroy all its data.`,
      );
      continue;
    }

    // Build a map of current DB columns for this entity.
    // Mirror the logic in buildSchemaSnapshot / DrizzleSchemaGenerator:
    //   - primitive (non-relation) fields → column name = f.name, type = f.type
    //   - many-to-one relation fields    → column name = `${f.name}Id`, type = 'Int'
    //   - virtual array / M:N fields     → no DB column, skip
    const currentColumns = new Map<string, FieldSnapshot>();
    for (const f of currentEntity.fields) {
      if (RESERVED.has(f.name)) continue;
      if (f.isRelation && f.isArray) continue; // virtual / M:N — no column

      if (f.isRelation) {
        currentColumns.set(`${f.name}Id`, {
          type: "Int",
          nullable: f.nullable,
        });
      } else {
        const snap: FieldSnapshot = { type: f.type, nullable: f.nullable };
        if (f.modifiers.includes("unique")) snap.unique = true;
        if (f.type === "Enum" && f.enumValues?.length)
          snap.enumValues = [...f.enumValues];
        currentColumns.set(f.name, snap);
      }
    }

    // ── Per-column checks ────────────────────────────────────────────────────
    for (const [colName, colSnap] of Object.entries(entitySnap.fields)) {
      const current = currentColumns.get(colName);

      if (!current) {
        warnings.push(
          `Destructive schema change: column '${colName}' was removed from entity '${entityName}'.` +
            ` Running 'vasp db push' will DROP the column and destroy its data.` +
            ` If you renamed the field, migrate the data manually before pushing.`,
        );
        continue;
      }

      if (current.type !== colSnap.type) {
        warnings.push(
          `Destructive schema change: column '${entityName}.${colName}' type changed` +
            ` from '${colSnap.type}' to '${current.type}'.` +
            ` Running 'vasp db push' may ALTER the column type and cause data loss or errors.`,
        );
      }

      if (colSnap.nullable && !current.nullable) {
        warnings.push(
          `Destructive schema change: column '${entityName}.${colName}' changed from nullable to NOT NULL.` +
            ` Running 'vasp db push' will fail if any existing rows contain NULL in this column.` +
            ` Backfill all NULLs before pushing (e.g., UPDATE <table> SET "${colName}" = <default> WHERE "${colName}" IS NULL).`,
        );
      }

      if (!colSnap.unique && current.unique) {
        warnings.push(
          `Destructive schema change: column '${entityName}.${colName}' gained a UNIQUE constraint.` +
            ` Running 'vasp db push' will fail if duplicate values exist in this column.` +
            ` Verify or deduplicate data before pushing.`,
        );
      }

      if (colSnap.enumValues && current.enumValues) {
        const removedValues = colSnap.enumValues.filter(
          (v) => !current.enumValues!.includes(v),
        );
        for (const val of removedValues) {
          warnings.push(
            `Destructive schema change: enum value '${val}' was removed from '${entityName}.${colName}'.` +
              ` Running 'vasp db push' will fail if any existing rows contain this value.` +
              ` Migrate all rows away from this value before removing it from the schema.`,
          );
        }
      }
    }

    // ── Table-level composite UNIQUE constraint checks ───────────────────────
    const snapConstraintKeys = new Set(
      (entitySnap.uniqueConstraints ?? []).map((uc) =>
        [...uc].sort().join(","),
      ),
    );
    for (const uc of currentEntity.uniqueConstraints ?? []) {
      const key = [...uc.fields].sort().join(",");
      if (!snapConstraintKeys.has(key)) {
        warnings.push(
          `Destructive schema change: a new composite UNIQUE constraint on [${uc.fields.join(", ")}]` +
            ` was added to entity '${entityName}'.` +
            ` Running 'vasp db push' will fail if duplicate combinations exist.` +
            ` Verify or deduplicate data before pushing.`,
        );
      }
    }

    // ── Index type change checks ─────────────────────────────────────────────
    const curIndexesByKey = new Map(
      (currentEntity.indexes ?? []).map((idx) => [
        [...idx.fields].sort().join(","),
        idx.type ?? "btree",
      ]),
    );
    for (const snapIdx of entitySnap.indexes ?? []) {
      const key = [...snapIdx.fields].sort().join(",");
      const curType = curIndexesByKey.get(key);
      if (curType !== undefined) {
        const prevType = snapIdx.type ?? "btree";
        if (curType !== prevType) {
          warnings.push(
            `Destructive schema change: index on [${snapIdx.fields.join(", ")}]` +
              ` in entity '${entityName}' changed type from '${prevType}' to '${curType}'.` +
              ` Running 'vasp db push' will drop and recreate the index,` +
              ` which may be slow on large tables.`,
          );
        }
      }
    }
  }

  return warnings;
}
