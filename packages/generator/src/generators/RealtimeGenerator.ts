import { BaseGenerator } from './BaseGenerator.js'
import { toCamelCase } from '../template/TemplateEngine.js'

export class RealtimeGenerator extends BaseGenerator {
  run(): void {
    const { ast, ext } = this.ctx
    if (ast.realtimes.length === 0) return

    this.ctx.logger.info('Generating realtime WebSocket channels...')

    // Server: one file per channel + index barrel
    for (const rt of ast.realtimes) {
      this.write(
        `server/routes/realtime/${toCamelCase(rt.name)}.${ext}`,
        this.render('shared/server/routes/realtime/_channel.hbs', {
          name: rt.name,
          entity: rt.entity,
          events: rt.events,
        }),
      )
    }

    this.write(
      `server/routes/realtime/index.${ext}`,
      this.render('shared/server/routes/realtime/index.hbs'),
    )

    // Client: useRealtime composable — SPA only (SSR realtime via WebSocket is handled client-side natively)
    if (this.ctx.isSpa) {
      this.write(
        `src/vasp/client/realtime.${ext}`,
        this.render(`spa/${ext}/src/vasp/client/realtime.${ext}.hbs`),
      )
    }
  }
}
