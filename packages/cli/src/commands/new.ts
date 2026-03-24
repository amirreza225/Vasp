import { generate } from '@vasp-framework/generator'
import { parse } from '@vasp-framework/parser'
import { join, resolve } from 'node:path'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { log } from '../utils/logger.js'
import { VASP_VERSION } from '@vasp-framework/core'
import { resolveTemplateDir, resolveStartersDir } from '../utils/template-dir.js'

const STARTERS_DIR = resolveStartersDir(import.meta.dirname)
const KNOWN_STARTERS = ['minimal', 'todo', 'todo-auth-ssr', 'recipe']

interface NewOptions {
  typescript: boolean
  ssr: boolean
  ssg: boolean
  starter?: string
  noInstall: boolean
}

export async function newCommand(args: string[]): Promise<void> {
  const appName = args[0]

  if (!appName) {
    log.error('Please provide a project name: vasp new <project-name>')
    process.exit(1)
  }

  const opts = parseOptions(args.slice(1))
  const outputDir = resolve(process.cwd(), appName)

  if (existsSync(outputDir)) {
    log.error(`Directory '${appName}' already exists`)
    process.exit(1)
  }

  log.step(`Creating Vasp app: ${appName}`)
  log.info(`Version: ${VASP_VERSION}`)

  // Resolve the main.vasp source — from starter or generated
  let vaspSource: string
  if (opts.starter) {
    if (!KNOWN_STARTERS.includes(opts.starter)) {
      log.error(`Unknown starter '${opts.starter}'. Available: ${KNOWN_STARTERS.join(', ')}`)
      process.exit(1)
    }
    const starterFile = join(STARTERS_DIR, `${opts.starter}.vasp`)
    if (!existsSync(starterFile)) {
      log.error(`Starter file not found: ${starterFile}`)
      process.exit(1)
    }
    vaspSource = readFileSync(starterFile, 'utf8')
    // Replace the app name to match the user's chosen name
    vaspSource = vaspSource.replace(/^app \w+/m, `app ${toPascal(appName)}`)
    log.info(`Starter: ${opts.starter}`)
  } else {
    log.info(`Mode: ${opts.ssg ? 'SSG' : opts.ssr ? 'SSR' : 'SPA'} | Language: ${opts.typescript ? 'TypeScript' : 'JavaScript'}`)
    vaspSource = buildInitialVasp(appName, opts)
  }

  // Parse it to get the AST
  let ast
  try {
    ast = parse(vaspSource, 'main.vasp')
  } catch (err) {
    log.error(`Internal error generating initial config: ${String(err)}`)
    process.exit(1)
  }

  const templateDir = resolveTemplateDir(import.meta.dirname)

  mkdirSync(outputDir, { recursive: true })

  const result = generate(ast, {
    outputDir,
    templateDir,
    logLevel: 'info',
  })

  if (!result.success) {
    log.error('Generation failed:')
    for (const err of result.errors) log.error(err)
    process.exit(1)
  }

  log.success(`Created ${result.filesWritten.length} files`)

  if (!opts.noInstall) {
    log.step('Installing dependencies...')
    const proc = Bun.spawn(['bun', 'install'], {
      cwd: outputDir,
      stdout: 'inherit',
      stderr: 'inherit',
    })
    await proc.exited
    if (proc.exitCode !== 0) {
      log.warn("bun install failed — run it manually inside your project")
    } else {
      log.success('Dependencies installed')
    }
  }

  log.step('🚀 Your Vasp app is ready!')
  log.dim('')
  log.dim(`  cd ${appName}`)
  log.dim('')
  log.dim('  # Make sure PostgreSQL is running, then push the schema:')
  log.dim('  bun run db:push')
  log.dim('')
  log.dim('  # Start the dev server:')
  log.dim('  vasp start')
  log.dim('')
  log.dim('  Edit .env to configure your database connection.')
}

function parseOptions(args: string[]): NewOptions {
  const starter = args.find((a) => a.startsWith('--starter='))?.split('=')[1]
  return {
    typescript: args.includes('--typescript') || args.includes('--ts'),
    ssr: args.includes('--ssr'),
    ssg: args.includes('--ssg'),
    noInstall: args.includes('--no-install'),
    ...(starter !== undefined && { starter }),
  }
}

function buildInitialVasp(appName: string, opts: NewOptions): string {
  const ssrValue = opts.ssg ? '"ssg"' : opts.ssr ? 'true' : 'false'
  return `app ${toPascal(appName)} {
  title: "${toTitle(appName)}"
  db: Drizzle
  ssr: ${ssrValue}
  typescript: ${opts.typescript}
}

route HomeRoute {
  path: "/"
  to: HomePage
}

page HomePage {
  component: import Home from "@src/pages/Home.vue"
}
`
}

function toPascal(str: string): string {
  return str
    .replace(/[-_\s]+(.)/g, (_, c: string) => (c as string).toUpperCase())
    .replace(/^./, (c) => c.toUpperCase())
}

function toTitle(str: string): string {
  return str
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}
