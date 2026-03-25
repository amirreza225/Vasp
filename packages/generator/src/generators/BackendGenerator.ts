import { DEFAULT_BACKEND_PORT, DEFAULT_SPA_PORT, VASP_VERSION } from '@vasp-framework/core'
import { BaseGenerator } from './BaseGenerator.js'

export class BackendGenerator extends BaseGenerator {
  run(): void {
    this.ctx.logger.info('Generating Elysia backend...')

    const middlewares = (this.ctx.ast.middlewares ?? []).map((middleware) => ({
      ...middleware,
      fnSource: this.resolveServerImport(middleware.fn.source, 'server/'),
      importAlias: `${this.camel(middleware.name)}Middleware`,
    }))
    const requiredEnvVars = Object.entries(this.ctx.ast.app.env ?? {})
      .filter(([, requirement]) => requirement === 'required')
      .map(([key]) => key)

    const data = {
      backendPort: DEFAULT_BACKEND_PORT,
      frontendPort: DEFAULT_SPA_PORT,
      vaspVersion: VASP_VERSION,
      middlewares,
      requiredEnvVars,
    }

    this.write(`server/index.${this.ctx.ext}`, this.render('shared/server/index.hbs', data))
    this.write(`server/db/client.${this.ctx.ext}`, this.render('shared/server/db/client.hbs', data))
    this.write(`server/middleware/rateLimit.${this.ctx.ext}`, this.render('shared/server/middleware/rateLimit.hbs', data))
    this.write(`server/middleware/errorHandler.${this.ctx.ext}`, this.render('shared/server/middleware/errorHandler.hbs', data))
    this.write(`server/middleware/logger.${this.ctx.ext}`, this.render('shared/server/middleware/logger.hbs', data))
    this.write(`server/routes/_vasp.${this.ctx.ext}`, this.render('shared/server/routes/_vasp.hbs', data))

    if (this.ctx.isSsr || this.ctx.isSsg) {
      this.write(`server/middleware/csrf.${this.ctx.ext}`, this.render('shared/server/middleware/csrf.hbs', data))
    }
  }

  private camel(str: string): string {
    return str.replace(/[-_\s]+(.)/g, (_, c: string) => (c as string).toUpperCase())
      .replace(/^./, (c) => c.toLowerCase())
  }
}
