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
        }),
      )
    }
  }

  private camel(str: string): string {
    return str.replace(/[-_\s]+(.)/g, (_, c: string) => (c as string).toUpperCase())
      .replace(/^./, (c) => c.toLowerCase())
  }
}
