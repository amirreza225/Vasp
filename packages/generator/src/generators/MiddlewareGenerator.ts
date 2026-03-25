import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ImportExpression } from '@vasp-framework/core'
import { BaseGenerator } from './BaseGenerator.js'

export class MiddlewareGenerator extends BaseGenerator {
  run(): void {
    const middlewares = this.ctx.ast.middlewares ?? []
    if (middlewares.length === 0) return

    this.ctx.logger.info('Generating middleware stubs...')
    this.generateSrcStubs(middlewares.map((middleware) => middleware.fn))
  }

  private generateSrcStubs(fns: ImportExpression[]): void {
    for (const fn of fns) {
      if (!fn.source.startsWith('@src/')) continue

      const relativePath = fn.source.replace('@src/', 'src/')
      if (existsSync(join(this.ctx.outputDir, relativePath))) continue

      const content =
        fn.kind === 'default'
          ? "import { Elysia } from 'elysia'\n\nexport default new Elysia()\n"
          : `import { Elysia } from 'elysia'\n\nexport const ${fn.namedExport} = new Elysia()\n`

      this.write(relativePath, content)
    }
  }
}
