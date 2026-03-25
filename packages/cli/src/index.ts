import { log } from './utils/logger.js'
import { newCommand } from './commands/new.js'
import { generateCommand } from './commands/generate.js'
import { migrateToTsCommand } from './commands/migrate-to-ts.js'
import { enableSsrCommand } from './commands/enable-ssr.js'
import { startCommand } from './commands/start.js'
import { buildCommand } from './commands/build.js'
import { deployCommand } from './commands/deploy.js'
import { dbCommand } from './commands/db.js'
import { VASP_VERSION } from '@vasp-framework/core'

export async function run(args: string[]): Promise<void> {
  const command = args[0]

  switch (command) {
    case 'new':
      await newCommand(args.slice(1))
      break

    case 'generate':
    case 'gen':
      await generateCommand(args.slice(1))
      break

    case '--version':
    case '-v':
      console.log(VASP_VERSION)
      break

    case '--help':
    case '-h':
    case undefined:
      printHelp()
      break

    case 'start':
      await startCommand()
      break

    case 'build':
      await buildCommand()
      break

    case 'migrate-to-ts':
      await migrateToTsCommand()
      break

    case 'enable-ssr':
      await enableSsrCommand()
      break

    case 'deploy':
      await deployCommand()
      break

    case 'db':
      await dbCommand(args.slice(1))
      break

    default:
      log.error(`Unknown command: ${command}`)
      printHelp()
      process.exit(1)
  }
}

function printHelp(): void {
  console.log(`
  vasp — declarative full-stack framework for Vue

  Usage:
    vasp new <project-name> [options]    Create a new Vasp project
    vasp generate [options]              Regenerate from main.vasp (preserves user changes)
    vasp enable-ssr                      Convert existing SPA project to SSR (Nuxt 4)
    vasp migrate-to-ts                   Convert existing JS project to TypeScript
    vasp start                           Start the dev server
    vasp build                           Build for production
    vasp db <push|generate|migrate|studio|seed>  Run database commands
    vasp deploy                          Deploy your app (planned)

  Options for 'vasp new':
    --typescript, --ts    Enable TypeScript (default: JavaScript)
    --ssr                 Enable SSR via Nuxt 4 (default: SPA)
    --ssg                 Enable Static Site Generation via Nuxt 4
    --no-install          Skip bun install

  Options for 'vasp generate':
    --force, -f           Overwrite user-modified files
    --dry-run             Preview what would change without writing files

  Examples:
    vasp new my-app
    vasp new my-app --typescript
    vasp new my-app --ssr --typescript
    vasp new my-app --ssg
    vasp generate
    vasp generate --dry-run
    vasp generate --force
  `)
}
