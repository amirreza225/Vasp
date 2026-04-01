import type {
  GeneratorOptions,
  GeneratorResult,
  VaspAST,
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
import { Manifest } from "./manifest/Manifest.js";
import type { SchemaSnapshot } from "./manifest/Manifest.js";
import { TemplateEngine } from "./template/TemplateEngine.js";
import { cleanupDir, commitStagedFiles, deleteOrphanedFiles } from "./utils/fs.js";
import { dirname, join } from "node:path";
import { mkdirSync, existsSync, rmSync } from "node:fs";

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
      const destructiveWarnings = detectDestructiveSchemaChanges(previousSnapshot, ast);
      warnings.push(...destructiveWarnings);
    }
  }

  // Helper: run a generator and collect its error without aborting the pipeline.
  function runGenerator(name: string, run: () => void): void {
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
    runGenerator("ScaffoldGenerator", () => new ScaffoldGenerator(ctx, engine, filesWritten, manifest).run());
    runGenerator("DrizzleSchemaGenerator", () => new DrizzleSchemaGenerator(ctx, engine, filesWritten, manifest).run());
    runGenerator("BackendGenerator", () => new BackendGenerator(ctx, engine, filesWritten, manifest).run());
    runGenerator("ObservabilityGenerator", () => new ObservabilityGenerator(ctx, engine, filesWritten, manifest).run());
    runGenerator("AuthGenerator", () => new AuthGenerator(ctx, engine, filesWritten, manifest).run());
    runGenerator("MiddlewareGenerator", () => new MiddlewareGenerator(ctx, engine, filesWritten, manifest).run());
    runGenerator("CacheGenerator", () => new CacheGenerator(ctx, engine, filesWritten, manifest).run());
    runGenerator("QueryActionGenerator", () => new QueryActionGenerator(ctx, engine, filesWritten, manifest).run());
    runGenerator("ApiGenerator", () => new ApiGenerator(ctx, engine, filesWritten, manifest).run());
    runGenerator("CrudGenerator", () => new CrudGenerator(ctx, engine, filesWritten, manifest).run());
    runGenerator("RealtimeGenerator", () => new RealtimeGenerator(ctx, engine, filesWritten, manifest).run());
    runGenerator("AutoPageGenerator", () => new AutoPageGenerator(ctx, engine, filesWritten, manifest).run());
    runGenerator("JobGenerator", () => new JobGenerator(ctx, engine, filesWritten, manifest).run());
    runGenerator("EmailGenerator", () => new EmailGenerator(ctx, engine, filesWritten, manifest).run());
    runGenerator("SeedGenerator", () => new SeedGenerator(ctx, engine, filesWritten, manifest).run());
    runGenerator("StorageGenerator", () => new StorageGenerator(ctx, engine, filesWritten, manifest).run());
    runGenerator("WebhookGenerator", () => new WebhookGenerator(ctx, engine, filesWritten, manifest).run());
    runGenerator("FrontendGenerator", () => new FrontendGenerator(ctx, engine, filesWritten, manifest).run());
    runGenerator("AdminGenerator", () => new AdminGenerator(ctx, engine, filesWritten, manifest).run());

    // If any generator reported an error, abort without touching the real output dir.
    if (errors.length > 0) {
      cleanupDir(stagingDir);
      return { success: false, filesWritten, errors, warnings };
    }

    // All generators succeeded — commit staged files to real output dir.
    // .env is preserved if the existing one has non-placeholder values.
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

    // Persist manifest to real output dir
    manifest.save(realOutputDir);

    // Clean up staging dir
    cleanupDir(stagingDir);

    logger.info(`✓ Generated ${filesWritten.length} files`);

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
 *
 * Exported so it can be unit-tested directly without running a full generation.
 */
export function detectDestructiveSchemaChanges(
  previousSnapshot: SchemaSnapshot,
  ast: VaspAST,
): string[] {
  const warnings: string[] = [];

  // Build a lookup of current entity → field name → field for O(1) checks
  const currentEntityMap = new Map(
    ast.entities.map((e) => [e.name, e]),
  );

  const RESERVED = new Set(["createdAt", "updatedAt"]);

  for (const [entityName, entitySnap] of Object.entries(previousSnapshot.entities)) {
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
    const currentColumns = new Map<string, { type: string; nullable: boolean }>();
    for (const f of currentEntity.fields) {
      if (RESERVED.has(f.name)) continue;
      if (f.isRelation && f.isArray) continue; // virtual / M:N — no column

      if (f.isRelation) {
        currentColumns.set(`${f.name}Id`, { type: "Int", nullable: f.nullable });
      } else {
        currentColumns.set(f.name, { type: f.type, nullable: f.nullable });
      }
    }

    for (const [colName, colSnap] of Object.entries(entitySnap.fields)) {
      const current = currentColumns.get(colName);

      if (!current) {
        warnings.push(
          `Destructive schema change: column '${colName}' was removed from entity '${entityName}'.` +
          ` Running 'vasp db push' will DROP the column and destroy its data.` +
          ` If you renamed the field, migrate the data manually before pushing.`,
        );
      } else if (current.type !== colSnap.type) {
        warnings.push(
          `Destructive schema change: column '${entityName}.${colName}' type changed` +
          ` from '${colSnap.type}' to '${current.type}'.` +
          ` Running 'vasp db push' may ALTER the column type and cause data loss or errors.`,
        );
      }
    }
  }

  return warnings;
}
