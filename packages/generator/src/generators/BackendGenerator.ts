import { DEFAULT_BACKEND_PORT, DEFAULT_SPA_PORT, VASP_VERSION } from '@vasp/core'
import { BaseGenerator } from './BaseGenerator.js'

export class BackendGenerator extends BaseGenerator {
  run(): void {
    this.ctx.logger.info('Generating Elysia backend...')

    const data = {
      backendPort: DEFAULT_BACKEND_PORT,
      frontendPort: DEFAULT_SPA_PORT,
      vaspVersion: VASP_VERSION,
    }

    this.write(`server/index.${this.ctx.ext}`, this.render('shared/server/index.hbs', data))
    this.write(`server/db/client.${this.ctx.ext}`, this.render('shared/server/db/client.hbs', data))
  }
}
