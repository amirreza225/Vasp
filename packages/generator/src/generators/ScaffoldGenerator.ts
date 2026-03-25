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
      'tests/crud',
      'tests/auth',
      'tests/queries',
      'tests/actions',
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

    // shared/validation — Valibot schemas derived from entities
    if (this.ctx.ast.entities.length > 0) {
      this.write(`shared/validation.${this.ctx.ext}`, this.render('shared/shared/validation.hbs', {
        entities: this.ctx.ast.entities,
      }))
    }

    // Test scaffold
    this.write(`vitest.config.${this.ctx.ext}`, this.render(`shared/tests/vitest.config.${this.ctx.ext}.hbs`))
    this.write(`tests/setup.${this.ctx.ext}`, this.render(`shared/tests/setup.${this.ctx.ext}.hbs`))

    for (const crud of this.ctx.ast.cruds) {
      this.write(
        `tests/crud/${crud.entity.toLowerCase()}.test.${this.ctx.ext}`,
        this.render(`shared/tests/crud/_entity.test.${this.ctx.ext}.hbs`, { entity: crud.entity }),
      )
    }

    for (const query of this.ctx.ast.queries) {
      this.write(
        `tests/queries/${query.name}.test.${this.ctx.ext}`,
        this.render(`shared/tests/queries/_query.test.${this.ctx.ext}.hbs`, { name: query.name }),
      )
    }

    for (const action of this.ctx.ast.actions) {
      this.write(
        `tests/actions/${action.name}.test.${this.ctx.ext}`,
        this.render(`shared/tests/actions/_action.test.${this.ctx.ext}.hbs`, { name: action.name }),
      )
    }

    if (this.ctx.ast.auth) {
      this.write(
        `tests/auth/login.test.${this.ctx.ext}`,
        this.render(`shared/tests/auth/login.test.${this.ctx.ext}.hbs`),
      )
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
      ...(ast.app.env && Object.keys(ast.app.env).length > 0
        ? [
          `  env: {`,
          ...Object.entries(ast.app.env).map(([key, requirement]) => `    ${key}: ${requirement}`),
          `  }`,
        ]
        : []),
      `}`,
      '',
    ]

    if (ast.auth) {
      lines.push(
        `auth ${ast.auth.name} {`,
        `  userEntity: ${ast.auth.userEntity}`,
        `  methods: [ ${ast.auth.methods.join(', ')} ]`,
        ...(ast.auth.roles && ast.auth.roles.length > 0 ? [`  roles: [ ${ast.auth.roles.join(', ')} ]`] : []),
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
        // Reconstruct the type string with enum variants and array notation
        let typeStr = field.type
        if (field.enumValues && field.enumValues.length > 0) {
          typeStr = `Enum(${field.enumValues.join(', ')})`
        }
        if (field.isArray) {
          typeStr += '[]'
        }

        // Reconstruct modifiers in canonical order
        const modParts: string[] = []
        if (field.modifiers.includes('id')) modParts.push('@id')
        if (field.modifiers.includes('unique')) modParts.push('@unique')
        if (field.defaultValue !== undefined) {
          if (field.defaultValue === 'now') {
            modParts.push('@default(now)')
          } else if (
            !isNaN(Number(field.defaultValue)) ||
            field.defaultValue === 'true' ||
            field.defaultValue === 'false'
          ) {
            modParts.push(`@default(${field.defaultValue})`)
          } else {
            modParts.push(`@default("${field.defaultValue}")`)
          }
        }
        if (field.onDelete) {
          // AST stores 'set null' (with space); DSL keyword is 'setNull'
          const onDeleteStr = field.onDelete === 'set null' ? 'setNull' : field.onDelete
          modParts.push(`@onDelete(${onDeleteStr})`)
        }
        if (field.nullable) modParts.push('@nullable')
        if (field.isUpdatedAt) modParts.push('@updatedAt')

        const mods = modParts.join(' ')
        lines.push(`  ${field.name}: ${typeStr}${mods ? ' ' + mods : ''}`)
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
        ...(query.roles && query.roles.length > 0 ? [`  roles: [${query.roles.join(', ')}]`] : []),
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
        ...(action.roles && action.roles.length > 0 ? [`  roles: [${action.roles.join(', ')}]`] : []),
        `}`,
        '',
      )
    }

    for (const middleware of ast.middlewares ?? []) {
      const fn = middleware.fn
      const fnStr = fn.kind === 'named'
        ? `import { ${fn.namedExport} } from "${fn.source}"`
        : `import ${fn.defaultExport} from "${fn.source}"`
      lines.push(
        `middleware ${middleware.name} {`,
        `  fn: ${fnStr}`,
        `  scope: ${middleware.scope}`,
        `}`,
        '',
      )
    }

    for (const api of ast.apis ?? []) {
      const fn = api.fn
      const fnStr = fn.kind === 'named'
        ? `import { ${fn.namedExport} } from "${fn.source}"`
        : `import ${fn.defaultExport} from "${fn.source}"`
      lines.push(
        `api ${api.name} {`,
        `  method: ${api.method}`,
        `  path: "${api.path}"`,
        `  fn: ${fnStr}`,
        ...(api.auth ? [`  auth: true`] : []),
        ...(api.roles && api.roles.length > 0 ? [`  roles: [${api.roles.join(', ')}]`] : []),
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

    for (const realtime of ast.realtimes) {
      lines.push(
        `realtime ${realtime.name} {`,
        `  entity: ${realtime.entity}`,
        `  events: [${realtime.events.join(', ')}]`,
        `}`,
        '',
      )
    }

    for (const job of ast.jobs) {
      const performFn = job.perform.fn
      const performFnStr = performFn.kind === 'named'
        ? `import { ${performFn.namedExport} } from "${performFn.source}"`
        : `import ${performFn.defaultExport} from "${performFn.source}"`
      lines.push(
        `job ${job.name} {`,
        `  executor: ${job.executor}`,
        `  perform: {`,
        `    fn: ${performFnStr}`,
        `  }`,
        ...(job.schedule ? [`  schedule: "${job.schedule}"`] : []),
        `}`,
        '',
      )
    }

    if (ast.seed) {
      const seedFn = ast.seed.fn
      const seedFnStr = seedFn.kind === 'named'
        ? `import { ${seedFn.namedExport} } from "${seedFn.source}"`
        : `import ${seedFn.defaultExport} from "${seedFn.source}"`
      lines.push(
        `seed {`,
        `  fn: ${seedFnStr}`,
        `}`,
        '',
      )
    }

    return lines.join('\n')
  }
}
