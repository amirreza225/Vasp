import { resolve, join } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { log } from '../utils/logger.js'

const DB_SUBCOMMANDS = ['push', 'generate', 'migrate', 'studio', 'seed'] as const
type DbSubcommand = (typeof DB_SUBCOMMANDS)[number]

export async function dbCommand(args: string[]): Promise<void> {
  const sub = args[0] as DbSubcommand | undefined
  const projectDir = resolve(process.cwd())
  const pkgFile = join(projectDir, 'package.json')

  if (!existsSync(pkgFile)) {
    log.error('No package.json found. Run this command inside a Vasp project.')
    process.exit(1)
  }

  if (!sub || !DB_SUBCOMMANDS.includes(sub)) {
    log.error(`Usage: vasp db <${DB_SUBCOMMANDS.join('|')}>`)
    if (sub) log.error(`Unknown subcommand: ${sub}`)
    process.exit(1)
  }

  const scriptName = `db:${sub}`
  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8')) as {
    scripts?: Record<string, string>
  }

  const script = pkg.scripts?.[scriptName]
  if (!script) {
    log.error(`No '${scriptName}' script found in package.json.`)
    process.exit(1)
  }

  log.step(`Running ${scriptName}...`)

  const [cmd, ...cmdArgs] = script.split(' ')
  const proc = Bun.spawn([cmd!, ...cmdArgs], {
    cwd: projectDir,
    stdout: 'inherit',
    stderr: 'inherit',
  })

  const exitCode = await proc.exited
  if (exitCode !== 0) {
    log.error(`${scriptName} failed with exit code ${exitCode}`)
    process.exit(exitCode)
  }

  log.success(`${scriptName} completed`)
}
