import { BaseGenerator } from './BaseGenerator.js'

export class DrizzleSchemaGenerator extends BaseGenerator {
  run(): void {
    this.ctx.logger.info('Generating Drizzle schema...')

    // Build a map from entity name → fields for the template
    const entityMap = new Map(
      this.ctx.ast.entities.map((e) => [e.name, e.fields]),
    )

    // Enrich each crud entry with field definitions from entity blocks.
    // Filter out createdAt/updatedAt — the schema template always appends them.
    const reservedFields = new Set(['createdAt', 'updatedAt'])
    const crudsWithFields = this.ctx.ast.cruds.map((crud) => ({
      ...crud,
      fields: (entityMap.get(crud.entity) ?? []).filter((f) => !reservedFields.has(f.name)),
      hasEntity: entityMap.has(crud.entity),
    }))

    this.write(
      `drizzle/schema.${this.ctx.ext}`,
      this.render('shared/drizzle/schema.hbs', { crudsWithFields }),
    )

    // Drizzle Kit config for migrations
    this.write(
      `drizzle.config.${this.ctx.ext}`,
      this.render('shared/drizzle/drizzle.config.hbs'),
    )
  }
}
