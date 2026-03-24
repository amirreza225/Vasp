import { BaseGenerator } from './BaseGenerator.js'

export class DrizzleSchemaGenerator extends BaseGenerator {
  run(): void {
    this.ctx.logger.info('Generating Drizzle schema...')

    // Build a map from entity name → fields for the template
    const entityMap = new Map(
      this.ctx.ast.entities.map((e) => [e.name, e.fields]),
    )

    // Enrich each crud entry with field definitions from entity blocks
    const crudsWithFields = this.ctx.ast.cruds.map((crud) => ({
      ...crud,
      fields: entityMap.get(crud.entity) ?? [],
      hasEntity: entityMap.has(crud.entity),
    }))

    this.write(
      `drizzle/schema.${this.ctx.ext}`,
      this.render('shared/drizzle/schema.hbs', { crudsWithFields }),
    )
  }
}
