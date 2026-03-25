import { join } from 'node:path'
import type { GeneratorContext } from '../GeneratorContext.js'
import type { Manifest } from '../manifest/Manifest.js'
import type { TemplateEngine } from '../template/TemplateEngine.js'
import { writeFile } from '../utils/fs.js'

export abstract class BaseGenerator {
  constructor(
    protected readonly ctx: GeneratorContext,
    protected readonly engine: TemplateEngine,
    protected readonly filesWritten: string[],
    protected readonly manifest: Manifest,
  ) {}

  abstract run(): void

  protected write(relativePath: string, content: string): void {
    const fullPath = join(this.ctx.outputDir, relativePath)
    writeFile(fullPath, content)
    this.filesWritten.push(relativePath)
    this.manifest.record(relativePath, content, this.constructor.name)
    this.ctx.logger.verbose(`  write ${relativePath}`)
  }

  protected render(templateKey: string, data: Record<string, unknown> = {}): string {
    return this.engine.render(templateKey, { ...this.baseData(), ...data })
  }

  protected baseData(): Record<string, unknown> {
    const { ast, isTypeScript, isSsr, isSsg, isSpa, ext, mode } = this.ctx
    return {
      appName: ast.app.name,
      appTitle: ast.app.title,
      isTypeScript,
      isSsr,
      isSsg,
      isSpa,
      ext,
      mode,
      hasAuth: !!ast.auth,
      hasAnyRelations: ast.entities.some(e => e.fields.some(f => f.isRelation)),
      hasRealtime: ast.realtimes.length > 0,
      hasJobs: ast.jobs.length > 0,
      routes: ast.routes,
      pages: ast.pages,
      queries: ast.queries,
      actions: ast.actions,
      apis: ast.apis ?? [],
      middlewares: ast.middlewares ?? [],
      cruds: ast.cruds,
      realtimes: ast.realtimes,
      jobs: ast.jobs,
      seed: ast.seed,
      auth: ast.auth,
    }
  }

  /**
   * Rewrites `@src/foo.js` → relative path from the given output directory.
   * E.g. from `server/routes/queries/` → `../../../src/foo.js`
   */
  protected resolveServerImport(source: string, fromDir: string): string {
    if (!source.startsWith('@src/')) return source
    const depth = fromDir.replace(/\/$/, '').split('/').length
    const prefix = '../'.repeat(depth)
    return prefix + source.slice(1) // strip the leading '@'
  }
}
