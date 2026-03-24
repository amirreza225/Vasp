import { BaseGenerator } from './BaseGenerator.js'

export class DrizzleSchemaGenerator extends BaseGenerator {
  run(): void {
    this.ctx.logger.info('Generating Drizzle schema...')
    this.write(
      `drizzle/schema.${this.ctx.ext}`,
      this.render('shared/drizzle/schema.hbs'),
    )
  }
}
