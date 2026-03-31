/**
 * E2E tests for `vasp new` — spawns the CLI as a real subprocess and checks
 * that the generated output matches expectations.
 *
 * These tests do NOT run `bun install` (--no-install) to keep them fast.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// Path to the monorepo root (e2e/ is one level down from root)
const MONOREPO_ROOT = resolve(import.meta.dirname, '..', '..')
const CLI_ENTRY = join(MONOREPO_ROOT, 'packages', 'cli', 'bin', 'vasp.ts')
const TMP_DIR = join(MONOREPO_ROOT, 'e2e', '__e2e_output__')

function vasp(args: string[], cwd = TMP_DIR) {
  return spawnSync('bun', [CLI_ENTRY, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 30_000,
  })
}

describe('vasp new', () => {
  beforeEach(() => {
    mkdirSync(TMP_DIR, { recursive: true })
  })

  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true })
  })

  // ---------------------------------------------------------------------------
  // Minimal SPA + JavaScript
  // ---------------------------------------------------------------------------
  describe('SPA + JavaScript (default)', () => {
    it('exits with code 0', () => {
      const result = vasp(['new', 'my-app', '--no-install'])
      expect(result.status).toBe(0)
    })

    it('generates core files', () => {
      vasp(['new', 'my-app', '--no-install'])
      const out = join(TMP_DIR, 'my-app')

      expect(existsSync(join(out, 'package.json'))).toBe(true)
      expect(existsSync(join(out, 'bunfig.toml'))).toBe(true)
      expect(existsSync(join(out, 'main.vasp'))).toBe(true)
      expect(existsSync(join(out, 'drizzle/schema.js'))).toBe(true)
      expect(existsSync(join(out, 'server/index.js'))).toBe(true)
      expect(existsSync(join(out, 'server/db/client.js'))).toBe(true)
    })

    it('generates Vite SPA frontend files', () => {
      vasp(['new', 'my-app', '--no-install'])
      const out = join(TMP_DIR, 'my-app')

      expect(existsSync(join(out, 'index.html'))).toBe(true)
      expect(existsSync(join(out, 'vite.config.js'))).toBe(true)
      expect(existsSync(join(out, 'src/main.js'))).toBe(true)
      expect(existsSync(join(out, 'src/App.vue'))).toBe(true)
      expect(existsSync(join(out, 'src/router/index.js'))).toBe(true)
    })

    it('package.json has the correct app name', () => {
      vasp(['new', 'my-app', '--no-install'])
      const pkg = JSON.parse(readFileSync(join(TMP_DIR, 'my-app', 'package.json'), 'utf8'))
      expect(pkg.name).toBe('my-app')
    })

    it('package.json has required runtime dependency', () => {
      vasp(['new', 'my-app', '--no-install'])
      const pkg = JSON.parse(readFileSync(join(TMP_DIR, 'my-app', 'package.json'), 'utf8'))
      expect(pkg.dependencies).toHaveProperty('@vasp-framework/runtime')
      expect(pkg.dependencies).toHaveProperty('elysia')
      expect(pkg.dependencies).toHaveProperty('vue')
    })

    it('does not generate TypeScript files', () => {
      vasp(['new', 'my-app', '--no-install'])
      const out = join(TMP_DIR, 'my-app')

      expect(existsSync(join(out, 'tsconfig.json'))).toBe(false)
      expect(existsSync(join(out, 'vite.config.ts'))).toBe(false)
      expect(existsSync(join(out, 'src/main.ts'))).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // TypeScript mode
  // ---------------------------------------------------------------------------
  describe('--typescript flag', () => {
    it('generates .ts files instead of .js', () => {
      vasp(['new', 'ts-app', '--typescript', '--no-install'])
      const out = join(TMP_DIR, 'ts-app')

      expect(existsSync(join(out, 'tsconfig.json'))).toBe(true)
      expect(existsSync(join(out, 'vite.config.ts'))).toBe(true)
      expect(existsSync(join(out, 'src/main.ts'))).toBe(true)
      expect(existsSync(join(out, 'src/router/index.ts'))).toBe(true)
      expect(existsSync(join(out, 'server/index.ts'))).toBe(true)
      expect(existsSync(join(out, 'drizzle/schema.ts'))).toBe(true)
    })

    it('does not generate .js entry files', () => {
      vasp(['new', 'ts-app', '--typescript', '--no-install'])
      const out = join(TMP_DIR, 'ts-app')

      expect(existsSync(join(out, 'src/main.js'))).toBe(false)
      expect(existsSync(join(out, 'vite.config.js'))).toBe(false)
    })

    it('--ts shorthand works identically', () => {
      vasp(['new', 'ts-app-short', '--ts', '--no-install'])
      const out = join(TMP_DIR, 'ts-app-short')

      expect(existsSync(join(out, 'tsconfig.json'))).toBe(true)
      expect(existsSync(join(out, 'src/main.ts'))).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // SSR mode
  // ---------------------------------------------------------------------------
  describe('--ssr flag', () => {
    it('generates Nuxt config instead of Vite config', () => {
      vasp(['new', 'ssr-app', '--ssr', '--no-install'])
      const out = join(TMP_DIR, 'ssr-app')

      expect(existsSync(join(out, 'nuxt.config.js'))).toBe(true)
      expect(existsSync(join(out, 'vite.config.js'))).toBe(false)
      expect(existsSync(join(out, 'index.html'))).toBe(false)
    })

    it('SSR + TypeScript generates nuxt.config.ts', () => {
      vasp(['new', 'ssr-ts-app', '--ssr', '--typescript', '--no-install'])
      const out = join(TMP_DIR, 'ssr-ts-app')

      expect(existsSync(join(out, 'nuxt.config.ts'))).toBe(true)
      expect(existsSync(join(out, 'tsconfig.json'))).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // SSG mode
  // ---------------------------------------------------------------------------
  describe('--ssg flag', () => {
    it('generates Nuxt config instead of Vite config', () => {
      vasp(['new', 'ssg-app', '--ssg', '--no-install'])
      const out = join(TMP_DIR, 'ssg-app')

      expect(existsSync(join(out, 'nuxt.config.js'))).toBe(true)
      expect(existsSync(join(out, 'vite.config.js'))).toBe(false)
      expect(existsSync(join(out, 'index.html'))).toBe(false)
    })

    it('SSG + TypeScript generates nuxt.config.ts', () => {
      vasp(['new', 'ssg-ts-app', '--ssg', '--typescript', '--no-install'])
      const out = join(TMP_DIR, 'ssg-ts-app')

      expect(existsSync(join(out, 'nuxt.config.ts'))).toBe(true)
      expect(existsSync(join(out, 'tsconfig.json'))).toBe(true)
    })

    it('main.vasp reflects ssr: "ssg" for SSG mode', () => {
      vasp(['new', 'ssg-check', '--ssg', '--no-install'])
      const vasp_file = readFileSync(join(TMP_DIR, 'ssg-check', 'main.vasp'), 'utf8')
      expect(vasp_file).toContain('ssr: "ssg"')
    })
  })

  // ---------------------------------------------------------------------------
  // Starter templates
  // ---------------------------------------------------------------------------
  describe('--starter flag', () => {
    it('scaffolds from the minimal starter', () => {
      vasp(['new', 'from-minimal', '--starter=minimal', '--no-install'])
      const out = join(TMP_DIR, 'from-minimal')

      expect(existsSync(join(out, 'package.json'))).toBe(true)
      expect(existsSync(join(out, 'main.vasp'))).toBe(true)
    })

    it('scaffolds from the todo starter', () => {
      vasp(['new', 'from-todo', '--starter=todo', '--no-install'])
      const out = join(TMP_DIR, 'from-todo')

      expect(existsSync(join(out, 'package.json'))).toBe(true)
      expect(existsSync(join(out, 'main.vasp'))).toBe(true)
    })

    it('scaffolds from the todo-auth-ssr starter', () => {
      vasp(['new', 'from-todo-auth-ssr', '--starter=todo-auth-ssr', '--no-install'])
      const out = join(TMP_DIR, 'from-todo-auth-ssr')

      expect(existsSync(join(out, 'package.json'))).toBe(true)
      expect(existsSync(join(out, 'main.vasp'))).toBe(true)
      // todo-auth-ssr starter uses SSR mode — nuxt.config.js should be present
      expect(existsSync(join(out, 'nuxt.config.js'))).toBe(true)
    })

    it('scaffolds from the recipe starter', () => {
      vasp(['new', 'from-recipe', '--starter=recipe', '--no-install'])
      const out = join(TMP_DIR, 'from-recipe')

      expect(existsSync(join(out, 'package.json'))).toBe(true)
      expect(existsSync(join(out, 'main.vasp'))).toBe(true)
    })

    it('exits with non-zero code for unknown starter', () => {
      const result = vasp(['new', 'bad-start', '--starter=nonexistent', '--no-install'])
      expect(result.status).not.toBe(0)
    })
  })

  // ---------------------------------------------------------------------------
  // Error cases
  // ---------------------------------------------------------------------------
  describe('error handling', () => {
    it('exits with non-zero code when no app name is provided', () => {
      const result = vasp(['new'])
      expect(result.status).not.toBe(0)
    })

    it('exits with non-zero code when directory already exists', () => {
      vasp(['new', 'existing-app', '--no-install'])
      const result = vasp(['new', 'existing-app', '--no-install'])
      expect(result.status).not.toBe(0)
    })
  })

  // ---------------------------------------------------------------------------
  // Generated main.vasp
  // ---------------------------------------------------------------------------
  describe('generated main.vasp', () => {
    it('contains the correct app name', () => {
      vasp(['new', 'cool-app', '--no-install'])
      const vasp_file = readFileSync(join(TMP_DIR, 'cool-app', 'main.vasp'), 'utf8')
      expect(vasp_file).toContain('app CoolApp')
    })

    it('reflects ssr: false for SPA mode', () => {
      vasp(['new', 'spa-check', '--no-install'])
      const vasp_file = readFileSync(join(TMP_DIR, 'spa-check', 'main.vasp'), 'utf8')
      expect(vasp_file).toContain('ssr: false')
    })

    it('reflects ssr: true for SSR mode', () => {
      vasp(['new', 'ssr-check', '--ssr', '--no-install'])
      const vasp_file = readFileSync(join(TMP_DIR, 'ssr-check', 'main.vasp'), 'utf8')
      expect(vasp_file).toContain('ssr: true')
    })

    it('reflects typescript: true for TS mode', () => {
      vasp(['new', 'ts-check', '--typescript', '--no-install'])
      const vasp_file = readFileSync(join(TMP_DIR, 'ts-check', 'main.vasp'), 'utf8')
      expect(vasp_file).toContain('typescript: true')
    })
  })

  // ---------------------------------------------------------------------------
  // TypeScript compilation (tsc --noEmit / vue-tsc)
  //
  // These tests run `bun install` so they are slower than the other tests, but
  // they verify that the generated TypeScript is actually valid — not just that
  // the files exist.
  // ---------------------------------------------------------------------------
  describe('TypeScript compilation (tsc --noEmit)', () => {
    /** Scaffolds an app, patches the runtime dep, and installs packages. */
    function scaffoldAndInstall(appName: string, flags: string[]): string {
      const result = vasp(['new', appName, ...flags, '--no-install'])
      expect(result.status, `vasp new failed:\n${result.stderr}`).toBe(0)

      const appDir = join(TMP_DIR, appName)
      const pkgPath = join(appDir, 'package.json')
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
        dependencies?: Record<string, string>
      }
      if (pkg.dependencies?.['@vasp-framework/runtime']) {
        pkg.dependencies['@vasp-framework/runtime'] =
          `file:${join(MONOREPO_ROOT, 'packages', 'runtime')}`
      }
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

      const installResult = spawnSync('bun', ['install'], {
        cwd: appDir,
        encoding: 'utf8',
        timeout: 120_000,
      })
      expect(
        installResult.status,
        `bun install failed:\n${installResult.stderr}`,
      ).toBe(0)

      return appDir
    }

    it(
      'SPA + TypeScript: generated code compiles without errors (vue-tsc --noEmit)',
      () => {
        const appDir = scaffoldAndInstall('ts-compile-check', ['--typescript'])

        // For SPA apps, the root tsconfig.json includes both server/**/*.ts
        // and src/**/*.{ts,vue}, so this catches errors across the whole project.
        // vue-tsc is used instead of plain tsc because it understands .vue SFCs.
        const tscResult = spawnSync(
          'bunx',
          ['vue-tsc', '--noEmit'],
          { cwd: appDir, encoding: 'utf8', timeout: 60_000 },
        )
        expect(
          tscResult.status,
          `SPA TypeScript compilation failed:\n${tscResult.stdout}\n${tscResult.stderr}`,
        ).toBe(0)
      },
      180_000, // 3 minutes: generation + bun install + vue-tsc
    )

    it(
      'SSR + TypeScript: server-side code compiles without errors (tsc --noEmit)',
      () => {
        const appDir = scaffoldAndInstall('ssr-ts-server-check', ['--ssr', '--typescript'])

        // Validate server-side TypeScript (Drizzle schema, Elysia routes,
        // auth middleware, rate limiter, etc.) without requiring nuxt prepare.
        const tscResult = spawnSync(
          'bunx',
          ['tsc', '--noEmit', '--project', 'server/tsconfig.json'],
          { cwd: appDir, encoding: 'utf8', timeout: 60_000 },
        )
        expect(
          tscResult.status,
          `SSR server-side TypeScript compilation failed:\n${tscResult.stdout}\n${tscResult.stderr}`,
        ).toBe(0)
      },
      180_000,
    )

    it(
      'SSR + TypeScript: full project (frontend + server) compiles without errors (nuxt prepare + vue-tsc)',
      () => {
        const appDir = scaffoldAndInstall('ssr-ts-full-check', ['--ssr', '--typescript'])

        // nuxt prepare generates .nuxt/tsconfig.json and type stubs for every
        // Nuxt-managed file (plugins/, composables/, middleware/, pages/, app.vue).
        // Nuxt's generated tsconfig includes `../**/*` which is referenced by the
        // root tsconfig through `extends`, so vue-tsc transitively validates the
        // full Nuxt frontend.
        const prepareResult = spawnSync(
          'bunx',
          ['nuxt', 'prepare'],
          { cwd: appDir, encoding: 'utf8', timeout: 120_000 },
        )
        expect(
          prepareResult.status,
          `nuxt prepare failed:\n${prepareResult.stdout}\n${prepareResult.stderr}`,
        ).toBe(0)

        const tscResult = spawnSync(
          'bunx',
          ['vue-tsc', '--noEmit'],
          { cwd: appDir, encoding: 'utf8', timeout: 90_000 },
        )
        expect(
          tscResult.status,
          `SSR full-project TypeScript compilation failed:\n${tscResult.stdout}\n${tscResult.stderr}`,
        ).toBe(0)
      },
      360_000, // 6 minutes: generation + bun install + nuxt prepare + vue-tsc
    )
  })
})
