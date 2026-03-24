import { BaseGenerator } from './BaseGenerator.js'
import { toCamelCase } from '../template/TemplateEngine.js'

export class JobGenerator extends BaseGenerator {
  run(): void {
    const { ast, ext } = this.ctx
    if (ast.jobs.length === 0) return

    this.ctx.logger.info('Generating background jobs...')

    // PgBoss singleton
    this.write(`server/jobs/boss.${ext}`, this.render('shared/jobs/boss.hbs'))

    // One worker file per job
    for (const job of ast.jobs) {
      const fn = job.perform.fn
      const namedExport = fn.kind === 'named' ? fn.namedExport : fn.defaultExport

      this.write(
        `server/jobs/${toCamelCase(job.name)}.${ext}`,
        this.render('shared/jobs/_job.hbs', {
          name: job.name,
          namedExport,
          fnSource: this.resolveServerImport(fn.source, `server/jobs/`),
          schedule: job.schedule,
          hasSchedule: !!job.schedule,
        }),
      )

      // HTTP endpoint to schedule this job
      this.write(
        `server/routes/jobs/${toCamelCase(job.name)}Schedule.${ext}`,
        this.render('shared/server/routes/jobs/_schedule.hbs', { name: job.name }),
      )
    }
  }
}
