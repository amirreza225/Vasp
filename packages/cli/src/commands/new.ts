import { generate } from '@vasp/generator'
import { parse } from '@vasp/parser'
import { join, resolve } from 'node:path'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { log } from '../utils/logger.js'
import { VASP_VERSION } from '@vasp/core'

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
  log.info(`Mode: ${opts.ssg ? 'SSG' : opts.ssr ? 'SSR' : 'SPA'} | Language: ${opts.typescript ? 'TypeScript' : 'JavaScript'}`)

  // Build the initial main.vasp source
  const vaspSource = buildInitialVasp(appName, opts)

  // Parse it to get the AST
  let ast
  try {
    ast = parse(vaspSource, 'main.vasp')
  } catch (err) {
    log.error(`Internal error generating initial config: ${String(err)}`)
    process.exit(1)
  }

  // Find the templates directory (relative to this file at runtime)
  const templateDir = join(import.meta.dirname, '..', '..', '..', '..', 'templates')

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
  log.dim(`  cd ${appName}`)
  log.dim(`  vasp start`)
}

function parseOptions(args: string[]): NewOptions {
  return {
    typescript: args.includes('--typescript') || args.includes('--ts'),
    ssr: args.includes('--ssr'),
    ssg: args.includes('--ssg'),
    noInstall: args.includes('--no-install'),
    starter: args.find((a) => a.startsWith('--starter='))?.split('=')[1],
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
