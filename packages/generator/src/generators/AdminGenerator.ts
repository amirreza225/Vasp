import { join } from 'node:path'
import { ensureDir } from '../utils/fs.js'
import { BaseGenerator } from './BaseGenerator.js'
import { DEFAULT_BACKEND_PORT } from '@vasp-framework/core'
import { toCamelCase } from '../template/TemplateEngine.js'

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
      'admin/src/composables',
      ...adminEntities.map((e) => `admin/src/views/${this.toKebabCase(e.name)}`),
    ]
    if (ast.auth) {
      adminDirs.push('admin/src/views/login')
    }
    for (const dir of adminDirs) {
      ensureDir(join(this.ctx.outputDir, dir))
    }

    // Create backend admin route directories
    ensureDir(join(this.ctx.outputDir, 'server/routes/admin'))

    const commonData = {
      adminEntities,
      backendPort: DEFAULT_BACKEND_PORT,
    }

    // ── Frontend files ────────────────────────────────────────────────

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

    // auth composable + login page — only when an auth block is present
    if (ast.auth) {
      this.write(
        `admin/src/composables/useAdminAuth.${ext}`,
        this.render('admin/src/composables/useAdminAuth.hbs', commonData),
      )
      this.write(
        'admin/src/views/login/index.vue',
        this.render('admin/src/views/login/index.vue.hbs', commonData),
      )
    }

    // Per-entity: API client + list view + form modal
    for (const entity of adminEntities) {
      // Pre-compute many-to-one relation metadata so templates can render FK selects.
      // Only singular (non-array) relation fields have a physical FK column on this table;
      // one-to-many (array) relations are virtual and stored on the related entity's side.
      const manyToOneRelations = entity.fields
        .filter((f) => f.isRelation && !f.isArray)
        .map((f) => ({
          name: f.name,
          fkName: `${f.name}Id`,
          relatedEntity: f.relatedEntity,
          nullable: f.nullable,
        }))
      // Deduplicated list of related entity names (for generating unique API imports)
      const uniqueRelatedEntities = [
        ...new Set(manyToOneRelations.map((r) => r.relatedEntity).filter(Boolean)),
      ]
      const entityData = {
        ...commonData,
        ...entity,
        manyToOneRelations,
        hasManyToOneRelations: manyToOneRelations.length > 0,
        uniqueRelatedEntities,
      }
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

    // ── Backend admin routes ──────────────────────────────────────────

    // Per-entity server-side admin CRUD handler
    for (const entity of adminEntities) {
      this.write(
        `server/routes/admin/${toCamelCase(entity.name)}.${ext}`,
        this.render('shared/server/routes/admin/_admin.hbs', {
          ...commonData,
          entity: entity.name,
        }),
      )
    }

    // Admin routes aggregator (imported by server/index.{ext})
    this.write(
      `server/routes/admin/index.${ext}`,
      this.render('shared/server/routes/admin/index.hbs', commonData),
    )
  }

  private toKebabCase(str: string): string {
    return str
      .replace(/([A-Z])/g, '-$1')
      .replace(/[\s_]+/g, '-')
      .toLowerCase()
      .replace(/^-/, '')
  }
}
