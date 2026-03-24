import { DEFAULT_BACKEND_PORT } from '@vasp/core'
import { BaseGenerator } from './BaseGenerator.js'

export class AuthGenerator extends BaseGenerator {
  run(): void {
    if (!this.ctx.ast.auth) return

    this.ctx.logger.info('Generating auth system...')

    const { ext, ast } = this.ctx
    const authMethods = ast.auth!.methods
    const data = {
      authMethods,
      backendPort: DEFAULT_BACKEND_PORT,
    }

    // Server: auth routes + JWT middleware
    this.write(`server/auth/index.${ext}`, this.render('shared/auth/server/index.hbs', data))
    this.write(`server/auth/middleware.${ext}`, this.render('shared/auth/server/middleware.hbs', data))

    // Server: providers
    if (authMethods.includes('usernameAndPassword')) {
      this.write(
        `server/auth/providers/usernameAndPassword.${ext}`,
        this.render('shared/auth/server/providers/usernameAndPassword.hbs', data),
      )
    }
    if (authMethods.includes('google')) {
      this.write(
        `server/auth/providers/google.${ext}`,
        this.render('shared/auth/server/providers/google.hbs', data),
      )
    }
    if (authMethods.includes('github')) {
      this.write(
        `server/auth/providers/github.${ext}`,
        this.render('shared/auth/server/providers/github.hbs', data),
      )
    }

    // Client: auth composable + Login/Register pages
    const modeExt = this.ctx.ext
    this.write(
      `src/vasp/auth.${modeExt}`,
      this.render(`spa/${modeExt}/src/vasp/auth.${modeExt}.hbs`, data),
    )
    this.write(
      'src/pages/Login.vue',
      this.render('shared/auth/client/Login.vue.hbs', data),
    )
    this.write(
      'src/pages/Register.vue',
      this.render('shared/auth/client/Register.vue.hbs', data),
    )
  }
}
