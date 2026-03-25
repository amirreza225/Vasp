import { DEFAULT_BACKEND_PORT, DEFAULT_SPA_PORT, DEFAULT_SSR_PORT } from '@vasp-framework/core'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { BaseGenerator } from './BaseGenerator.js'

export class FrontendGenerator extends BaseGenerator {
  run(): void {
    this.ctx.logger.info(`Generating frontend (${this.ctx.mode} / ${this.ctx.ext})...`)

    if (this.ctx.isSpa) {
      this.generateSpa()
    } else {
      this.generateSsr()
    }
  }

  private generateSpa(): void {
    const { ext, ast } = this.ctx
    const data = {
      backendPort: DEFAULT_BACKEND_PORT,
      frontendPort: DEFAULT_SPA_PORT,
    }

    // Static files
    this.write(`index.html`, this.render(`spa/${ext}/index.html.hbs`))
    this.write(`vite.config.${ext}`, this.render(`spa/${ext}/vite.config.${ext}.hbs`, data))

    // Vue app entry
    this.write(`src/main.${ext}`, this.render(`spa/${ext}/src/main.${ext}.hbs`))
    this.write(`src/App.vue`, this.render(`spa/${ext}/src/App.vue.hbs`))
    this.write(
      `src/components/VaspErrorBoundary.vue`,
      this.render(`spa/${ext}/src/components/VaspErrorBoundary.vue.hbs`),
    )
    this.write(
      `src/components/VaspNotifications.vue`,
      this.render(`spa/${ext}/src/components/VaspNotifications.vue.hbs`),
    )
    this.write(
      `src/vasp/useVaspNotifications.${ext}`,
      this.render(`spa/${ext}/src/vasp/useVaspNotifications.${ext}.hbs`),
    )

    // Router — build page component source map
    const pagesMap = this.buildPagesMap()
    this.write(
      `src/router/index.${ext}`,
      this.render(`spa/${ext}/src/router/index.${ext}.hbs`, { pagesMap }),
    )

    // Vasp plugin
    this.write(`src/vasp/plugin.${ext}`, this.render(`spa/${ext}/src/vasp/plugin.${ext}.hbs`))

    // Client SDK
    this.write(`src/vasp/client/index.${ext}`, this.render(`spa/${ext}/src/vasp/client/index.${ext}.hbs`))
    if (ast.queries.length > 0) {
      this.write(`src/vasp/client/queries.${ext}`, this.render(`spa/${ext}/src/vasp/client/queries.${ext}.hbs`))
    }
    if (ast.actions.length > 0) {
      this.write(`src/vasp/client/actions.${ext}`, this.render(`spa/${ext}/src/vasp/client/actions.${ext}.hbs`))
    }

    // TS-only: generate types.ts from entity schema + query/action signatures
    if (this.ctx.isTypeScript && (ast.queries.length > 0 || ast.actions.length > 0 || ast.cruds.length > 0 || ast.entities.length > 0)) {
      this.write(`src/vasp/client/types.ts`, this.render(`spa/ts/src/vasp/client/types.ts.hbs`, {
        entities: ast.entities,
      }))
    }

    // Scaffold empty page files if they don't exist
    for (const page of ast.pages) {
      const comp = page.component
      const src = comp.kind === 'default' ? comp.source : comp.source
      const relativePath = src.replace('@src/', 'src/')
      const fullPath = join(this.ctx.outputDir, relativePath)
      if (!existsSync(fullPath)) {
        const pageName = comp.kind === 'default' ? comp.defaultExport : comp.namedExport
        this.write(relativePath, this.scaffoldVuePage(pageName))
      }
    }
  }

  private generateSsr(): void {
    const { ext, ast } = this.ctx
    const backendPort = DEFAULT_BACKEND_PORT
    const data = { backendPort }

    // Nuxt config
    this.write(`nuxt.config.${ext}`, this.render(`ssr/${ext}/nuxt.config.${ext}.hbs`, data))

    // Root app component
    this.write(`app.vue`, this.render(`ssr/${ext}/app.vue.hbs`))
    this.write(`error.vue`, this.render(`ssr/${ext}/error.vue.hbs`))

    // Dual-transport plugins
    this.write(`plugins/vasp.server.${ext}`, this.render(`ssr/${ext}/plugins/vasp.server.${ext}.hbs`))
    this.write(`plugins/vasp.client.${ext}`, this.render(`ssr/${ext}/plugins/vasp.client.${ext}.hbs`))

    // Composables
    this.write(`composables/useVasp.${ext}`, this.render(`ssr/${ext}/composables/useVasp.${ext}.hbs`))

    // Auth composable + middleware (only when auth block present)
    if (ast.auth) {
      this.write(`composables/useAuth.${ext}`, this.render(`ssr/${ext}/composables/useAuth.${ext}.hbs`))
      this.write(`middleware/auth.${ext}`, this.render(`ssr/${ext}/middleware/auth.${ext}.hbs`))
    }

    // Generate Nuxt pages from Vasp routes
    const pagesMap = this.buildPagesMap()
    for (const route of ast.routes) {
      const pageFile = this.routePathToNuxtFile(route.path)
      const componentSource = pagesMap[route.to]
      if (!componentSource) continue
      const componentName = this.extractComponentName(componentSource)
      this.write(
        `pages/${pageFile}`,
        this.render(`ssr/${ext}/_page.vue.hbs`, { componentName, componentSource }),
      )
    }

    // Auth login/register pages
    if (ast.auth) {
      this.write(
        `pages/login.vue`,
        this.render(`ssr/${ext}/_page.vue.hbs`, {
          componentName: 'LoginPage',
          componentSource: '@src/pages/Login.vue',
        }),
      )
      this.write(
        `pages/register.vue`,
        this.render(`ssr/${ext}/_page.vue.hbs`, {
          componentName: 'RegisterPage',
          componentSource: '@src/pages/Register.vue',
        }),
      )
    }

    // Scaffold empty src/pages/ component files if they don't exist
    for (const page of ast.pages) {
      const comp = page.component
      const src = comp.kind === 'default' ? comp.source : comp.source
      const relativePath = src.replace('@src/', 'src/')
      const fullPath = join(this.ctx.outputDir, relativePath)
      if (!existsSync(fullPath)) {
        const pageName = comp.kind === 'default' ? comp.defaultExport : comp.namedExport
        this.write(relativePath, this.scaffoldVuePage(pageName))
      }
    }
  }

  /** Converts a Vasp route path to a Nuxt pages/ file name.
   *  "/" → "index.vue", "/about" → "about.vue", "/users/:id" → "users/[id].vue" */
  private routePathToNuxtFile(path: string): string {
    if (path === '/') return 'index.vue'
    // Replace Express-style :param with Nuxt [param]
    const normalized = path
      .replace(/^\//, '')
      .replace(/:([^/]+)/g, '[$1]')
    return `${normalized}.vue`
  }

  private buildPagesMap(): Record<string, string> {
    const map: Record<string, string> = {}
    for (const page of this.ctx.ast.pages) {
      const src = page.component.kind === 'default' ? page.component.source : page.component.source
      map[page.name] = src
    }
    return map
  }

  private extractComponentName(source: string): string {
    // "@src/pages/Home.vue" → "Home"
    const basename = source.split('/').pop() ?? source
    return basename.replace(/\.vue$/, '')
  }

  private scaffoldVuePage(name: string): string {
    return `<template>
  <div>
    <h1>${name}</h1>
    <p>Edit this page in src/pages/</p>
  </div>
</template>
`
  }
}
