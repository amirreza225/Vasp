import { ensureDir } from '../utils/fs.js'
import { join } from 'node:path'
import { BaseGenerator } from './BaseGenerator.js'
import { VASP_VERSION } from '@vasp-framework/core'
import { DEFAULT_BACKEND_PORT, DEFAULT_SPA_PORT, DEFAULT_SSR_PORT } from '@vasp-framework/core'

export class ScaffoldGenerator extends BaseGenerator {
  run(): void {
    this.ctx.logger.info('Scaffolding project structure...')

    // Create directory skeleton
    const dirs = [
      'src/pages',
      'src/components',
      'src/lib',
      'shared',
      'drizzle',
      'drizzle/migrations',
      'server/routes/queries',
      'server/routes/actions',
      'server/middleware',
      'server/db',
      'tests',
      ...(this.ctx.isSpa
        ? ['src/vasp/client']
        : ['composables', 'plugins', 'pages', 'middleware']),
    ]
    for (const dir of dirs) {
      ensureDir(join(this.ctx.outputDir, dir))
    }

    const frontendPort = this.ctx.isSpa ? DEFAULT_SPA_PORT : DEFAULT_SSR_PORT

    // package.json
    const pkgContent = this.render('shared/package.json.hbs', {
      vaspVersion: VASP_VERSION,
      backendPort: DEFAULT_BACKEND_PORT,
      frontendPort,
      authMethods: this.ctx.ast.auth?.methods ?? [],
    })
    this.write('package.json', pkgContent)

    // bunfig.toml
    this.write('bunfig.toml', this.render('shared/bunfig.toml.hbs'))

    // .gitignore
    this.write('.gitignore', this.render('shared/.gitignore.hbs'))

    // .env.example
    const envData = {
      backendPort: DEFAULT_BACKEND_PORT,
      frontendPort,
      authMethods: this.ctx.ast.auth?.methods ?? [],
    }
    this.write('.env.example', this.render('shared/.env.example.hbs', envData))

    // .env (working copy so the app starts immediately)
    this.write('.env', this.render('shared/.env.hbs', envData))

    // README.md
    this.write('README.md', this.render('shared/README.md.hbs', {
      backendPort: DEFAULT_BACKEND_PORT,
    }))

    // tsconfig.json — only when typescript: true
    if (this.ctx.isTypeScript) {
      this.write('tsconfig.json', this.render('shared/tsconfig.json.hbs'))
    }

    // shared/types — entity interfaces + query/action type stubs (TS only)
    if (this.ctx.isTypeScript && this.ctx.ast.entities.length > 0) {
      this.write('shared/types.ts', this.render('shared/shared/types.hbs', {
        entities: this.ctx.ast.entities,
      }))
    }

    // main.vasp (copy the source)
    this.write('main.vasp', this.generateMainVasp())
  }

  private generateMainVasp(): string {
    // The user's main.vasp is placed at the project root as-is during `vasp new`
    // During scaffold, we generate a clean version based on the parsed AST
    const { ast } = this.ctx
    const ext = this.ctx.ext

    const lines: string[] = [
      `app ${ast.app.name} {`,
      `  title: "${ast.app.title}"`,
      `  db: ${ast.app.db}`,
      `  ssr: ${typeof ast.app.ssr === 'string' ? `"${ast.app.ssr}"` : ast.app.ssr}`,
      `  typescript: ${ast.app.typescript}`,
      `}`,
      '',
    ]

    if (ast.auth) {
      lines.push(
        `auth ${ast.auth.name} {`,
        `  userEntity: ${ast.auth.userEntity}`,
        `  methods: [ ${ast.auth.methods.join(', ')} ]`,
        `}`,
        '',
      )
    }

    for (const route of ast.routes) {
      lines.push(`route ${route.name} {`, `  path: "${route.path}"`, `  to: ${route.to}`, `}`, '')
    }

    for (const page of ast.pages) {
      const comp = page.component
      const importStr = comp.kind === 'default'
        ? `import ${comp.defaultExport} from "${comp.source}"`
        : `import { ${comp.namedExport} } from "${comp.source}"`
      lines.push(`page ${page.name} {`, `  component: ${importStr}`, `}`, '')
    }

    for (const entity of ast.entities) {
      lines.push(`entity ${entity.name} {`)
      for (const field of entity.fields) {
        const mods = field.modifiers.map((m) => `@${m.replace('_', '(').replace('default_now', 'default(now)')}`).join(' ')
        lines.push(`  ${field.name}: ${field.type}${mods ? ' ' + mods : ''}`)
      }
      lines.push(`}`, '')
    }

    for (const query of ast.queries) {
      const fn = query.fn
      const fnStr = fn.kind === 'named'
        ? `import { ${fn.namedExport} } from "${fn.source}"`
        : `import ${fn.defaultExport} from "${fn.source}"`
      lines.push(
        `query ${query.name} {`,
        `  fn: ${fnStr}`,
        `  entities: [${query.entities.join(', ')}]`,
        ...(query.auth ? [`  auth: true`] : []),
        `}`,
        '',
      )
    }

    for (const action of ast.actions) {
      const fn = action.fn
      const fnStr = fn.kind === 'named'
        ? `import { ${fn.namedExport} } from "${fn.source}"`
        : `import ${fn.defaultExport} from "${fn.source}"`
      lines.push(
        `action ${action.name} {`,
        `  fn: ${fnStr}`,
        `  entities: [${action.entities.join(', ')}]`,
        ...(action.auth ? [`  auth: true`] : []),
        `}`,
        '',
      )
    }

    for (const crud of ast.cruds) {
      lines.push(
        `crud ${crud.name} {`,
        `  entity: ${crud.entity}`,
        `  operations: [${crud.operations.join(', ')}]`,
        `}`,
        '',
      )
    }

    return lines.join('\n')
  }
}
