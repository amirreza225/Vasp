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
import { TemplateEngine } from "./template/TemplateEngine.js";
import { cleanupDir, commitStagedFiles } from "./utils/fs.js";
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
  const manifest = new Manifest(VASP_VERSION);

  try {
    // Execute generators in dependency order (all writes go to staging dir)
    new ScaffoldGenerator(ctx, engine, filesWritten, manifest).run();
    new DrizzleSchemaGenerator(ctx, engine, filesWritten, manifest).run();
    new BackendGenerator(ctx, engine, filesWritten, manifest).run();
    new ObservabilityGenerator(ctx, engine, filesWritten, manifest).run();
    new AuthGenerator(ctx, engine, filesWritten, manifest).run();
    new MiddlewareGenerator(ctx, engine, filesWritten, manifest).run();
    new CacheGenerator(ctx, engine, filesWritten, manifest).run();
    new QueryActionGenerator(ctx, engine, filesWritten, manifest).run();
    new ApiGenerator(ctx, engine, filesWritten, manifest).run();
    new CrudGenerator(ctx, engine, filesWritten, manifest).run();
    new RealtimeGenerator(ctx, engine, filesWritten, manifest).run();
    new AutoPageGenerator(ctx, engine, filesWritten, manifest).run();
    new JobGenerator(ctx, engine, filesWritten, manifest).run();
    new EmailGenerator(ctx, engine, filesWritten, manifest).run();
    new SeedGenerator(ctx, engine, filesWritten, manifest).run();
    new StorageGenerator(ctx, engine, filesWritten, manifest).run();
    new WebhookGenerator(ctx, engine, filesWritten, manifest).run();
    new FrontendGenerator(ctx, engine, filesWritten, manifest).run();
    new AdminGenerator(ctx, engine, filesWritten, manifest).run();

    // All generators succeeded — commit staged files to real output dir.
    // .env is preserved if the existing one has non-placeholder values.
    commitStagedFiles(stagingDir, realOutputDir, { preserveEnv: true });

    // Remove stale counterpart router file from the real output dir.
    // Vite resolves '.js' imports literally, so if both index.js and index.ts
    // exist, the explicit .js import in main.ts wins and the generated file is ignored.
    const ext = ast.app.typescript ? "ts" : "js";
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
    const isSsrMode = ast.app.ssr === true || ast.app.ssr === "ssg";
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
    // Clean up staging dir on failure — real output dir is untouched
    cleanupDir(stagingDir);
    const message = err instanceof Error ? err.message : String(err);
    logger.error(message);
    return { success: false, filesWritten, errors: [message], warnings };
  }
}
