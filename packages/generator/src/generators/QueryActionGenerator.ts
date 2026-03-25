import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ImportExpression } from '@vasp-framework/core'
import { BaseGenerator } from './BaseGenerator.js'

export class QueryActionGenerator extends BaseGenerator {
  run(): void {
    const { ast, ext } = this.ctx

    if (ast.queries.length > 0 || ast.actions.length > 0) {
      this.ctx.logger.info('Generating query/action routes...')
    }

    for (const query of ast.queries) {
      const fn = query.fn
      const namedExport = fn.kind === 'named' ? fn.namedExport : fn.defaultExport
      const fnSource = this.resolveServerImport(fn.source, 'server/routes/queries/')

      this.write(
        `server/routes/queries/${this.camel(query.name)}.${ext}`,
        this.render('shared/server/routes/queries/_query.hbs', {
          name: query.name,
          namedExport,
          fnSource,
          requiresAuth: query.auth,
          hasRoles: (query.roles ?? []).length > 0,
          roles: query.roles ?? [],
        }),
      )
    }

    for (const action of ast.actions) {
      const fn = action.fn
      const namedExport = fn.kind === 'named' ? fn.namedExport : fn.defaultExport
      const fnSource = this.resolveServerImport(fn.source, 'server/routes/actions/')

      this.write(
        `server/routes/actions/${this.camel(action.name)}.${ext}`,
        this.render('shared/server/routes/actions/_action.hbs', {
          name: action.name,
          namedExport,
          fnSource,
          requiresAuth: action.auth,
          hasRoles: (action.roles ?? []).length > 0,
          roles: action.roles ?? [],
        }),
      )
    }

    // Generate src/ stub files so the server imports resolve on first run
    this.generateSrcStubs(ast.queries, '[]')
    this.generateSrcStubs(ast.actions, '{ success: true }')
  }

  /** Groups items by source file and writes a stub exporting each function. Skips existing files. */
  private generateSrcStubs(
    items: Array<{ fn: ImportExpression }>,
    defaultReturn: string,
  ): void {
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
      if (existsSync(join(this.ctx.projectDir, relativePath))) continue
      const content =
        fnNames
          .map(
            (name) =>
              `export async function ${name}({ db, user, args }) {\n  // TODO: implement\n  return ${defaultReturn}\n}`,
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
