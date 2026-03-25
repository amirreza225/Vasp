import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ImportExpression } from '@vasp-framework/core'
import { BaseGenerator } from './BaseGenerator.js'

export class ApiGenerator extends BaseGenerator {
  run(): void {
    const { ast, ext } = this.ctx
    const apis = ast.apis ?? []

    if (apis.length > 0) {
      this.ctx.logger.info('Generating custom API routes...')
    }

    for (const api of apis) {
      const fn = api.fn
      const namedExport = fn.kind === 'named' ? fn.namedExport : fn.defaultExport
      const fnSource = this.resolveServerImport(fn.source, 'server/routes/api/')

      this.write(
        `server/routes/api/${this.camel(api.name)}.${ext}`,
        this.render('shared/server/routes/api/_api.hbs', {
          name: api.name,
          method: api.method,
          path: api.path,
          namedExport,
          fnSource,
          requiresAuth: api.auth,
          hasRoles: (api.roles ?? []).length > 0,
          roles: api.roles ?? [],
        }),
      )
    }

    this.generateSrcStubs(apis)
  }

  private generateSrcStubs(items: Array<{ fn: ImportExpression }>): void {
    const bySource = new Map<string, string[]>()
    for (const item of items) {
      const { fn } = item
      if (!fn.source.startsWith('@src/')) continue
      const fnName = fn.kind === 'named' ? fn.namedExport : fn.defaultExport
      if (!bySource.has(fn.source)) bySource.set(fn.source, [])
      bySource.get(fn.source)!.push(fnName)
    }

    for (const [source, fnNames] of bySource) {
      const relativePath = source.replace('@src/', 'src/')
      if (existsSync(join(this.ctx.outputDir, relativePath))) continue
      const content =
        fnNames
          .map(
            (name) =>
              `export async function ${name}({ db, user, args }) {\n  // TODO: implement\n  return { success: true }\n}`,
          )
          .join('\n\n') + '\n'
      this.write(relativePath, content)
    }
  }

  private camel(str: string): string {
    return str.replace(/[-_\s]+(.)/g, (_, c: string) => (c as string).toUpperCase())
      .replace(/^./, (c) => c.toLowerCase())
  }
}
