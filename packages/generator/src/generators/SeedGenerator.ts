import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { BaseGenerator } from './BaseGenerator.js'

export class SeedGenerator extends BaseGenerator {
  run(): void {
    const { seed, app } = this.ctx.ast
    if (!seed) return

    this.ctx.logger.info('Generating seed runner...')

    const ext = this.ctx.ext
    const fn = seed.fn
    const seedImportName = fn.kind === 'named' ? fn.namedExport : fn.defaultExport
    const fnSource = this.resolveServerImport(fn.source, 'server/db/')

    this.write(
      `server/db/seed.${ext}`,
      this.render('shared/server/db/seed.hbs', {
        seedImportKind: fn.kind,
        seedImportName,
        fnSource,
      }),
    )

    this.generateSeedStubIfMissing(fn.source, seedImportName)
  }

  private generateSeedStubIfMissing(source: string, importName: string): void {
    if (!source.startsWith('@src/')) return

    const relativePath = source.replace('@src/', 'src/')
    const fullPath = join(this.ctx.projectDir, relativePath)
    if (existsSync(fullPath)) return

    const content = this.ctx.isTypeScript
      ? `export default async function ${importName}(context: { db: unknown }): Promise<void> {\n  void context\n}\n`
      : `export default async function ${importName}(context) {\n  void context\n}\n`

    this.write(relativePath, content)
  }
}
