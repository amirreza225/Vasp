import { BaseGenerator } from './BaseGenerator.js'
import { toCamelCase } from '../template/TemplateEngine.js'

export class CrudGenerator extends BaseGenerator {
  run(): void {
    const { ast, ext } = this.ctx
    if (ast.cruds.length === 0) return

    this.ctx.logger.info('Generating CRUD endpoints...')

    // Build a map of entity → realtime block name for auto-publish
    const realtimeByEntity = new Map(
      ast.realtimes.map((rt) => [rt.entity, rt.name]),
    )

    for (const crud of ast.cruds) {
      const realtimeName = realtimeByEntity.get(crud.entity)
      this.write(
        `server/routes/crud/${toCamelCase(crud.entity)}.${ext}`,
        this.render('shared/server/routes/crud/_crud.hbs', {
          entity: crud.entity,
          operations: crud.operations,
          hasRealtime: !!realtimeName,
          realtimeName: realtimeName ?? '',
        }),
      )
    }

    // Client SDK: crud helpers — SPA only (SSR uses $vasp composable via dual-transport plugin)
    if (this.ctx.isSpa) {
      this.write(
        `src/vasp/client/crud.${ext}`,
        this.render(`spa/${ext}/src/vasp/client/crud.${ext}.hbs`),
      )
    }
  }
}
