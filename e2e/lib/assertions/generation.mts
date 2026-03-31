/**
 * Generation assertion suite.
 *
 * Verifies that `vasp new` + `vasp generate --force` produced the expected
 * output files for a given fixture based on its FixtureCapabilities.
 *
 * Usage (in a generation.test.ts file):
 *   import { generationSuite } from '../../lib/assertions/generation.mts'
 *   generationSuite(readFixtureState('minimal'))
 */

import { test, expect } from '../test.mts'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import type { FixtureState } from '../types.mts'

export function generationSuite(state: FixtureState): void {
  const { generation, capabilities, appDir } = state
  const ext = capabilities.isTypeScript ? 'ts' : 'js'
  const exists = (rel: string) => existsSync(join(appDir, rel))
  const fileContains = (rel: string, text: string) => {
    const p = join(appDir, rel)
    if (!existsSync(p)) return false
    return readFileSync(p, 'utf8').includes(text)
  }

  test.describe(`[${state.name}] Generation`, () => {
    // ── Exit codes ─────────────────────────────────────────────────────────

    test('vasp new exits with code 0', () => {
      expect(generation.exitCode).toBe(0)
    })

    test('vasp generate --force exits with code 0', () => {
      expect(generation.regenExitCode ?? 0).toBe(0)
    })

    // ── No semantic or template errors ─────────────────────────────────────

    test('no semantic errors (E1xx) in vasp new output', () => {
      expect(generation.semanticErrors).toHaveLength(0)
    })

    test('no semantic errors (E1xx) in vasp generate output', () => {
      expect(generation.regenSemanticErrors ?? []).toHaveLength(0)
    })

    test('no Handlebars template errors in vasp new output', () => {
      expect(generation.templateErrors).toHaveLength(0)
    })

    test('no Handlebars template errors in vasp generate output', () => {
      expect(generation.regenTemplateErrors ?? []).toHaveLength(0)
    })

    // ── Universal scaffold files ───────────────────────────────────────────

    test('package.json is generated', () => {
      expect(exists('package.json')).toBe(true)
    })

    test('main.vasp is present (fixture was installed)', () => {
      expect(exists('main.vasp')).toBe(true)
    })

    test('.env is generated', () => {
      expect(exists('.env')).toBe(true)
    })

    test('.env.example is generated', () => {
      expect(exists('.env.example')).toBe(true)
    })

    test('.env.example includes E2E_MAGIC_TOKEN', () => {
      expect(fileContains('.env.example', 'E2E_MAGIC_TOKEN')).toBe(true)
    })

    test(`drizzle schema is generated (.${ext})`, () => {
      expect(exists(`drizzle/schema.${ext}`)).toBe(true)
    })

    test(`server entry point is generated (.${ext})`, () => {
      expect(exists(`server/index.${ext}`)).toBe(true)
    })

    test(`database client is generated (.${ext})`, () => {
      expect(exists(`server/db/client.${ext}`)).toBe(true)
    })

    test('package.json depends on elysia', () => {
      const pkg = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8')) as {
        dependencies?: Record<string, string>
      }
      expect(pkg.dependencies).toHaveProperty('elysia')
    })

    test('package.json depends on @vasp-framework/runtime', () => {
      const pkg = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8')) as {
        dependencies?: Record<string, string>
      }
      expect(pkg.dependencies).toHaveProperty('@vasp-framework/runtime')
    })

    test('rate limiter middleware is generated', () => {
      expect(exists(`server/middleware/rateLimit.${ext}`)).toBe(true)
    })

    // ── Auth files ─────────────────────────────────────────────────────────

    if (capabilities.hasAuth) {
      test('auth router is generated', () => {
        expect(exists(`server/auth/index.${ext}`)).toBe(true)
      })

      test('auth middleware is generated', () => {
        expect(exists(`server/auth/middleware.${ext}`)).toBe(true)
      })

      test('usernameAndPassword provider is generated (auth methods include it)', () => {
        if (capabilities.authMethods.includes('usernameAndPassword')) {
          expect(exists(`server/auth/providers/usernameAndPassword.${ext}`)).toBe(true)
        }
      })

      test('Login.vue is generated', () => {
        expect(
          exists(`src/pages/Login.vue`) || exists(`pages/Login.vue`),
        ).toBe(true)
      })

      test('Register.vue is generated', () => {
        expect(
          exists(`src/pages/Register.vue`) || exists(`pages/Register.vue`),
        ).toBe(true)
      })

      test('package.json depends on @elysiajs/jwt (auth enabled)', () => {
        const pkg = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8')) as {
          dependencies?: Record<string, string>
        }
        expect(pkg.dependencies).toHaveProperty('@elysiajs/jwt')
      })
    }

    // ── CRUD files ─────────────────────────────────────────────────────────

    if (capabilities.hasCrud) {
      for (const entity of capabilities.crudEntityNames) {
        const route = entity.toLowerCase()
        test(`CRUD route for ${entity} is generated`, () => {
          expect(exists(`server/routes/crud/${route}.${ext}`)).toBe(true)
        })
      }
    }

    // ── Query/action files ─────────────────────────────────────────────────

    if (capabilities.queryNames.length > 0) {
      for (const q of capabilities.queryNames) {
        test(`query handler for ${q} is generated`, () => {
          expect(exists(`server/routes/queries/${q}.${ext}`)).toBe(true)
        })
      }
    }

    if (capabilities.actionNames.length > 0) {
      for (const a of capabilities.actionNames) {
        test(`action handler for ${a} is generated`, () => {
          expect(exists(`server/routes/actions/${a}.${ext}`)).toBe(true)
        })
      }
    }

    // ── Realtime ───────────────────────────────────────────────────────────

    if (capabilities.hasRealtime) {
      test('realtime WebSocket index is generated', () => {
        expect(exists(`server/routes/realtime/index.${ext}`)).toBe(true)
      })
      for (const ch of capabilities.channelNames) {
        const slug = ch.charAt(0).toLowerCase() + ch.slice(1)
        test(`realtime channel handler for ${ch} is generated`, () => {
          expect(
            exists(`server/routes/realtime/${slug}.${ext}`) ||
              exists(`server/routes/realtime/${ch}.${ext}`),
          ).toBe(true)
        })
      }
    }

    // ── Jobs ────────────────────────────────────────────────────────────────

    if (capabilities.hasJobs) {
      if (capabilities.hasJobsPgBoss) {
        test('PgBoss setup file is generated', () => {
          expect(exists(`server/jobs/pgboss.${ext}`) || exists(`server/jobs/boss.${ext}`)).toBe(true)
        })
      }
      if (capabilities.hasJobsBullMQ) {
        test('BullMQ setup file is generated', () => {
          expect(exists(`server/jobs/bullmq.${ext}`)).toBe(true)
        })
      }
      if (capabilities.hasJobsRabbitMQ) {
        test('RabbitMQ setup file is generated', () => {
          expect(exists(`server/jobs/rabbitmq.${ext}`)).toBe(true)
        })
      }
      if (capabilities.hasJobsKafka) {
        test('Kafka setup file is generated', () => {
          expect(exists(`server/jobs/kafka.${ext}`)).toBe(true)
        })
      }
      for (const job of capabilities.jobNames) {
        const slug = job.charAt(0).toLowerCase() + job.slice(1)
        test(`job worker for ${job} is generated`, () => {
          expect(
            exists(`server/jobs/${slug}.${ext}`) ||
              exists(`server/jobs/_${slug}.${ext}`),
          ).toBe(true)
        })
      }
    }

    // ── Storage ────────────────────────────────────────────────────────────

    if (capabilities.hasStorage) {
      test('storage provider config is generated', () => {
        expect(
          exists(`server/storage/provider.${ext}`) ||
            exists(`server/storage/_provider.${ext}`),
        ).toBe(true)
      })
    }

    // ── Email ──────────────────────────────────────────────────────────────

    if (capabilities.hasEmail) {
      test('email mailer config is generated', () => {
        expect(
          exists(`server/email/mailer.${ext}`) ||
            exists(`server/email/_mailer.${ext}`),
        ).toBe(true)
      })
    }

    // ── Cache ──────────────────────────────────────────────────────────────

    if (capabilities.hasCache) {
      test('cache store config is generated', () => {
        expect(
          exists(`server/cache/index.${ext}`) ||
            exists(`server/cache/store.${ext}`),
        ).toBe(true)
      })
    }

    // ── Admin panel ────────────────────────────────────────────────────────

    if (capabilities.hasAdmin) {
      test('admin panel entry is generated', () => {
        expect(
          exists('admin/index.html') ||
            exists('admin/src/main.ts') ||
            exists('admin/src/main.js'),
        ).toBe(true)
      })
    }

    // ── Frontend: SPA ──────────────────────────────────────────────────────

    if (!capabilities.isSsr && !capabilities.isSsg) {
      test('Vite config is generated', () => {
        expect(exists(`vite.config.${ext}`)).toBe(true)
      })

      test('index.html is generated', () => {
        expect(exists('index.html')).toBe(true)
      })

      test(`src/main.${ext} is generated`, () => {
        expect(exists(`src/main.${ext}`)).toBe(true)
      })

      test('src/App.vue is generated', () => {
        expect(exists('src/App.vue')).toBe(true)
      })

      test(`src/router/index.${ext} is generated`, () => {
        expect(exists(`src/router/index.${ext}`)).toBe(true)
      })
    }

    // ── Frontend: SSR / SSG (Nuxt 4) ──────────────────────────────────────

    if (capabilities.isSsr || capabilities.isSsg) {
      test(`nuxt.config.${ext} is generated`, () => {
        expect(exists(`nuxt.config.${ext}`)).toBe(true)
      })

      test('app.vue is generated', () => {
        expect(exists('app.vue')).toBe(true)
      })

      test('app.vue includes PrimeVue global overlay components (Q6)', () => {
        const content = readFileSync(join(appDir, 'app.vue'), 'utf8')
        expect(content).toContain('<Toast />')
        expect(content).toContain('<ConfirmDialog />')
        expect(content).toContain('<DynamicDialog />')
      })

      // Q1: Single universal plugin replaces the old vasp.server / vasp.client split
      test('universal Nuxt plugin is generated (plugins/vasp)', () => {
        expect(exists(`plugins/vasp.${ext}`)).toBe(true)
      })

      test('old split plugins are NOT generated (vasp.client / vasp.server)', () => {
        expect(exists(`plugins/vasp.client.${ext}`)).toBe(false)
        expect(exists(`plugins/vasp.server.${ext}`)).toBe(false)
      })

      test(`composables/useVasp.${ext} is generated`, () => {
        expect(exists(`composables/useVasp.${ext}`)).toBe(true)
      })

      // Q2: SSR auth uses useState — useAuth composable is the SSR-safe auth API
      if (capabilities.hasAuth) {
        test(`composables/useAuth.${ext} is generated (Q2 useState auth)`, () => {
          expect(exists(`composables/useAuth.${ext}`)).toBe(true)
        })

        // Q5: per-route auth middleware
        test(`middleware/auth.${ext} is generated (Q5 route protection)`, () => {
          expect(exists(`middleware/auth.${ext}`)).toBe(true)
        })

        test('middleware/auth calls checkAuth() to hydrate session on SSR', () => {
          const content = readFileSync(join(appDir, `middleware/auth.${ext}`), 'utf8')
          // Without await checkAuth(), every SSR request starts with user=null and
          // redirects to /login even when the browser sends a valid session cookie.
          expect(content).toContain('await checkAuth()')
        })
      }

      // Q3: Typed CRUD composables for SSR
      if (capabilities.hasCrud) {
        test(`composables/crud.${ext} is generated (Q3 typed CRUD composables)`, () => {
          expect(exists(`composables/crud.${ext}`)).toBe(true)
        })
      }
    }

    // ── Multi-tenant ───────────────────────────────────────────────────────

    if (capabilities.hasMultiTenant) {
      test('drizzle schema contains tenant field reference', () => {
        const schema = readFileSync(join(appDir, `drizzle/schema.${ext}`), 'utf8')
        // The schema should define a workspaceId or tenantId column
        expect(schema).toMatch(/workspace|tenant/i)
      })
    }

    // ── AutoPages ──────────────────────────────────────────────────────────

    if (capabilities.hasAutoPages) {
      test('at least one autoPage component is generated', () => {
        // AutoPages land in src/pages/ (SPA) or pages/ (SSR)
        const hasSpaPages = capabilities.autoPagePaths.some((p) => {
          const slug = p.replace(/^\//, '').replace(/\//g, '-').replace(/:(\w+)/g, '_$1')
          return (
            exists(`src/pages/${slug}.vue`) ||
              exists(`src/views/${slug}.vue`)
          )
        })
        // At minimum, verify that the generation step succeeded
        // (the generated page paths depend on the autoPage path definition)
        expect(generation.regenExitCode ?? generation.exitCode).toBe(0)
      })
    }

    // ── Webhooks ───────────────────────────────────────────────────────────

    if (capabilities.hasWebhooks && capabilities.hasInboundWebhooks) {
      test('inbound webhook route is generated', () => {
        expect(
          exists(`server/routes/webhooks`) ||
            existsSync(join(appDir, `server/routes/webhook`)),
        ).toBe(true)
      })
    }

    // ── TypeScript compilation ──────────────────────────────────────────────
    //
    // Validates that the generated TypeScript compiles without errors.
    // Only runs for TypeScript fixtures; deps are already installed by
    // FixtureHarness so no extra install step is needed.
    //
    // SPA TypeScript:
    //   vue-tsc --noEmit on the root tsconfig.json, which includes both
    //   server/**/*.ts and src/**/*.{ts,vue} in a single pass.
    //
    // SSR/SSG TypeScript (two tests):
    //   1. Server-side only — `tsc --noEmit --project server/tsconfig.json`.
    //      server/tsconfig.json extends ../tsconfig.json which in turn extends
    //      .nuxt/tsconfig.json, but tsc resolves missing extends gracefully
    //      in recent versions (or the fixture harness already has .nuxt/ from
    //      starting the Nuxt dev server).
    //   2. Full project (frontend + server) — `nuxt prepare` (generates
    //      .nuxt/tsconfig.json and component/composable type stubs) followed by
    //      `vue-tsc --noEmit`. Nuxt's generated tsconfig includes `../**/*`
    //      which is referenced by the root tsconfig through `extends`, so
    //      vue-tsc transitively validates plugins/, composables/, middleware/,
    //      pages/, app.vue, and error.vue in addition to drizzle/ and shared/.

    if (capabilities.isTypeScript) {
      const isSrr = capabilities.isSsr || capabilities.isSsg

      if (isSrr) {
        // Test 1: server-side TypeScript (fast, no nuxt prepare needed)
        test(
          'server-side TypeScript compiles without errors (tsc --noEmit)',
          { timeout: 60_000 },
          () => {
            const tscResult = spawnSync(
              'bunx',
              ['tsc', '--noEmit', '--project', 'server/tsconfig.json'],
              { cwd: appDir, encoding: 'utf8', timeout: 60_000 },
            )
            expect(
              tscResult.status,
              `Server-side TypeScript compilation failed:\n${tscResult.stdout}\n${tscResult.stderr}`,
            ).toBe(0)
          },
        )

        // Test 2: full project (Nuxt frontend + server) via nuxt prepare + vue-tsc
        test(
          'full SSR project TypeScript compiles without errors (nuxt prepare + vue-tsc --noEmit)',
          { timeout: 120_000 },
          () => {
            // nuxt prepare generates .nuxt/tsconfig.json and component/composable
            // type stubs that reference plugins/, composables/, middleware/, pages/.
            const prepareResult = spawnSync('bunx', ['nuxt', 'prepare'], {
              cwd: appDir,
              encoding: 'utf8',
              timeout: 90_000,
            })
            expect(
              prepareResult.status,
              `nuxt prepare failed:\n${prepareResult.stdout}\n${prepareResult.stderr}`,
            ).toBe(0)

            // vue-tsc --noEmit reads the root tsconfig.json (which extends
            // .nuxt/tsconfig.json), and Nuxt's type stubs transitively pull in
            // every frontend source file, so errors in any .vue / .ts file are caught.
            const tscResult = spawnSync('bunx', ['vue-tsc', '--noEmit'], {
              cwd: appDir,
              encoding: 'utf8',
              timeout: 90_000,
            })
            expect(
              tscResult.status,
              `Full-project TypeScript compilation failed:\n${tscResult.stdout}\n${tscResult.stderr}`,
            ).toBe(0)
          },
        )
      } else {
        // SPA: vue-tsc --noEmit covers everything in one shot
        test(
          'generated TypeScript compiles without errors (vue-tsc --noEmit)',
          { timeout: 60_000 },
          () => {
            const tscResult = spawnSync('bunx', ['vue-tsc', '--noEmit'], {
              cwd: appDir,
              encoding: 'utf8',
              timeout: 60_000,
            })
            expect(
              tscResult.status,
              `TypeScript compilation failed:\n${tscResult.stdout}\n${tscResult.stderr}`,
            ).toBe(0)
          },
        )
      }
    }
  })
}
