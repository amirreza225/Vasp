import type { GeneratorOptions, GeneratorResult, VaspAST } from '@vasp-framework/core'
import { VASP_VERSION } from '@vasp-framework/core'
import { createConsoleLogger, createContext } from './GeneratorContext.js'
import { AuthGenerator } from './generators/AuthGenerator.js'
import { ApiGenerator } from './generators/ApiGenerator.js'
import { BackendGenerator } from './generators/BackendGenerator.js'
import { CrudGenerator } from './generators/CrudGenerator.js'
import { DrizzleSchemaGenerator } from './generators/DrizzleSchemaGenerator.js'
import { FrontendGenerator } from './generators/FrontendGenerator.js'
import { JobGenerator } from './generators/JobGenerator.js'
import { MiddlewareGenerator } from './generators/MiddlewareGenerator.js'
import { QueryActionGenerator } from './generators/QueryActionGenerator.js'
import { RealtimeGenerator } from './generators/RealtimeGenerator.js'
import { ScaffoldGenerator } from './generators/ScaffoldGenerator.js'
import { SeedGenerator } from './generators/SeedGenerator.js'
import { Manifest } from './manifest/Manifest.js'
import { TemplateEngine } from './template/TemplateEngine.js'
import { join } from 'node:path'

export function generate(ast: VaspAST, opts: GeneratorOptions): GeneratorResult {
  const logger = createConsoleLogger(opts.logLevel ?? 'info')
  const ctx = createContext(ast, opts.outputDir, {
    ...(opts.templateDir !== undefined ? { templateDir: opts.templateDir } : {}),
    logger,
  })

  const engine = new TemplateEngine()
  engine.loadDirectory(ctx.templateDir)

  const filesWritten: string[] = []
  const warnings: string[] = []
  const manifest = new Manifest(VASP_VERSION)

  try {
    // Execute generators in dependency order
    new ScaffoldGenerator(ctx, engine, filesWritten, manifest).run()
    new DrizzleSchemaGenerator(ctx, engine, filesWritten, manifest).run()
    new BackendGenerator(ctx, engine, filesWritten, manifest).run()
    new AuthGenerator(ctx, engine, filesWritten, manifest).run()
    new MiddlewareGenerator(ctx, engine, filesWritten, manifest).run()
    new QueryActionGenerator(ctx, engine, filesWritten, manifest).run()
    new ApiGenerator(ctx, engine, filesWritten, manifest).run()
    new CrudGenerator(ctx, engine, filesWritten, manifest).run()
    new RealtimeGenerator(ctx, engine, filesWritten, manifest).run()
    new JobGenerator(ctx, engine, filesWritten, manifest).run()
    new SeedGenerator(ctx, engine, filesWritten, manifest).run()
    new FrontendGenerator(ctx, engine, filesWritten, manifest).run()

    // Persist manifest
    manifest.save(ctx.outputDir)

    logger.info(`✓ Generated ${filesWritten.length} files`)

    return { success: true, filesWritten, errors: [], warnings }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(message)
    return { success: false, filesWritten, errors: [message], warnings }
  }
}
