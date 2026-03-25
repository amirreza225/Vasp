import { join } from 'node:path'
import { ensureDir } from '../utils/fs.js'
import { BaseGenerator } from './BaseGenerator.js'
import { DEFAULT_BACKEND_PORT } from '@vasp-framework/core'

export class AdminGenerator extends BaseGenerator {
  run(): void {
    const { ast, ext } = this.ctx
    if (!ast.admin) return

    this.ctx.logger.info('Generating admin panel...')

    const entityMap = new Map(ast.entities.map((e) => [e.name, e]))

    // Resolve admin entities to their full EntityNode definitions
    const adminEntities = ast.admin.entities.map((name) => {
      const entity = entityMap.get(name)
      return entity ?? { name, fields: [], type: 'Entity' as const, loc: ast.admin!.loc }
    })

    // Create directory structure under admin/
    const adminDirs = [
      'admin/src/router',
      'admin/src/layouts',
      'admin/src/views/dashboard',
      'admin/src/api',
      ...adminEntities.map((e) => `admin/src/views/${this.toKebabCase(e.name)}`),
    ]
    for (const dir of adminDirs) {
      ensureDir(join(this.ctx.outputDir, dir))
    }

    const commonData = {
      adminEntities,
      backendPort: DEFAULT_BACKEND_PORT,
    }

    // admin/package.json
    this.write(
      'admin/package.json',
      this.render('admin/package.json.hbs', commonData),
    )

    // admin/index.html
    this.write(
      'admin/index.html',
      this.render('admin/index.html.hbs', commonData),
    )

    // admin/vite.config.{ext}
    this.write(
      `admin/vite.config.${ext}`,
      this.render('admin/vite.config.hbs', commonData),
    )

    // admin/src/main.{ext}
    this.write(
      `admin/src/main.${ext}`,
      this.render('admin/src/main.hbs', commonData),
    )

    // admin/src/App.vue
    this.write(
      'admin/src/App.vue',
      this.render('admin/src/App.vue.hbs', commonData),
    )

    // admin/src/router/index.{ext}
    this.write(
      `admin/src/router/index.${ext}`,
      this.render('admin/src/router/index.hbs', commonData),
    )

    // admin/src/layouts/AdminLayout.vue
    this.write(
      'admin/src/layouts/AdminLayout.vue',
      this.render('admin/src/layouts/AdminLayout.vue.hbs', commonData),
    )

    // admin/src/views/dashboard/index.vue
    this.write(
      'admin/src/views/dashboard/index.vue',
      this.render('admin/src/views/dashboard/index.vue.hbs', commonData),
    )

    // Per-entity: API client + list view + form modal
    for (const entity of adminEntities) {
      const entityData = { ...commonData, ...entity }
      const kebabName = this.toKebabCase(entity.name)

      this.write(
        `admin/src/api/${kebabName}.${ext}`,
        this.render('admin/src/api/_entity.hbs', entityData),
      )

      this.write(
        `admin/src/views/${kebabName}/index.vue`,
        this.render('admin/src/views/_entity/index.vue.hbs', entityData),
      )

      this.write(
        `admin/src/views/${kebabName}/FormModal.vue`,
        this.render('admin/src/views/_entity/FormModal.vue.hbs', entityData),
      )
    }
  }

  private toKebabCase(str: string): string {
    return str
      .replace(/([A-Z])/g, '-$1')
      .replace(/[\s_]+/g, '-')
      .toLowerCase()
      .replace(/^-/, '')
  }
}
