**Product Requirements Document (PRD)**  
**Vasp Framework**  
**Version:** 1.1 (Complete First Release)  
**Date:** March 24, 2026  

---

### 1. Executive Summary

**Vasp** is a revolutionary, batteries-included, declarative full-stack web framework for Vue developers.

It delivers the exact same magical developer experience that made **Wasp** legendary — a single declarative configuration file (`main.vasp`) that automatically generates a complete production-ready application — but rebuilt from the ground up with the absolute best and fastest technologies available in 2026.

**Core differentiators from Wasp and every other framework:**
- Frontend: **Vue 3** (default SPA) **or** **Nuxt 4** (SSR + SSG)
- Language: **Pure JavaScript** (default) **or** full **TypeScript** (opt-in)
- Runtime: **Bun** (primary, fastest possible)
- Backend: **Elysia** (fastest framework on Bun)
- ORM: **Drizzle** (lightest and fastest)
- Client ↔ Server: **ofetch** (isomorphic, Nuxt-native)
- Config DSL: `.vasp` (branded and clear)

Developers can start with pure JS + SPA in under 5 seconds and explicitly upgrade to TypeScript + Nuxt 4 SSR/SSG with a single CLI flag — **without ever leaving the magical `main.vasp` workflow**.

**Tagline:**  
"Wasp magic for Vue — now with Bun + Elysia speed, Drizzle simplicity, full TypeScript support, and Nuxt 4 SSR/SSG."

This is the **complete, production-ready v1.0 PRD**. It contains everything needed to build the first full version of Vasp.

---

### 2. Product Goals

- Provide the **fastest possible full-stack development experience** for Vue developers in 2026.
- Maintain zero-boilerplate, declarative workflow (`main.vasp` + your code).
- Support both hobbyists (pure JS + SPA) and professional teams (TypeScript + Nuxt 4 SSR/SSG).
- Deliver production-grade security, performance, and scalability from day one.
- Be open-source (Apache License 2.0).

**Success Metrics**
- `vasp new my-app` completes in < 5 seconds.
- Dev server starts in < 50 ms.
- Full Todo + Auth + SSR example works out-of-the-box.
- Generated code is clean, readable, and follows modern best practices.
- 100% backward compatibility between JS/TS and SPA/SSR modes.

---

### 3. Technical Stack

| Layer                  | Technology                                          | Default / Opt-in          | Reason |
|------------------------|-----------------------------------------------------|---------------------------|--------|
| Runtime                | **Bun** (primary) + Node.js fallback                | Default                   | Fastest JS runtime in 2026 |
| Backend Framework      | **Elysia**                                          | Default                   | Fastest framework on Bun |
| ORM                    | **Drizzle**                                         | Default                   | Lightest bundle, fastest queries |
| Frontend               | **Vue 3 + Vite** (SPA) **or** **Nuxt 4** (SSR/SSG) | JS+SPA default, SSR opt-in | Best DX + SSR/SSG |
| Language               | **Pure JavaScript** + **full TypeScript support**   | JS default, TS opt-in     | Maximum flexibility |
| HTTP Client            | **ofetch** (isomorphic `$vasp` composable)          | Default                   | Works identically in SPA, SSR, and server context with zero shimming |
| Config DSL             | Custom `.vasp` files (`main.vasp`)                  | Default                   | Single source of truth |

---

### 4. Core Features

#### 4.1 Declarative Configuration (`main.vasp`)
Every Vasp project starts with a single `main.vasp` file.

```vasp
app MyTodoApp {
  title: "Vasp Todo"
  db: Drizzle
  ssr: true          // false = SPA (default), true = SSR, "ssg" = Static Site Generation
  typescript: true   // false = pure JS (default)
}

auth User {
  userEntity: User
  methods: [ usernameAndPassword, google, github ]
}

route HomeRoute {
  path: "/"
  to: HomePage
}

page HomePage {
  component: import Home from "@src/pages/Home.vue"
}

query getTodos {
  fn: import { getTodos } from "@src/queries.js"   // or .ts when typescript: true
  entities: [Todo]
}

action createTodo {
  fn: import { createTodo } from "@src/actions.js" // or .ts
  entities: [Todo]
}

crud Todo {
  entity: Todo
  operations: [list, create, update, delete]
}

realtime TodoChannel {
  entity: Todo
  events: [created, updated, deleted]
}

job sendWelcomeEmail {
  executor: PgBoss
  perform: {
    fn: import { sendWelcomeEmail } from "@src/jobs.js"
  }
}
```

#### 4.2 Frontend — Two Explicit, Fully Separate Modes

Vasp generates one of two clearly distinct frontend targets based on the `ssr` flag in `main.vasp`. These are **not a unified abstraction** — they are two separate, well-understood template trees that share business logic only. This is a deliberate architectural decision: explicit modes eliminate hidden edge cases, produce clean and debuggable generated code, and make the mental model predictable for the developer.

**SPA Mode** (`ssr: false`, default)
- Pure Vue 3 + Vite + Vue Router
- Generated output is a standard Vite project — no SSR-specific concepts
- Auth guards via Vue Router `beforeEach` hooks
- Client-side rendering only; ideal for dashboards, admin panels, and authenticated apps

**SSR / SSG Mode** (`ssr: true` or `ssr: "ssg"`)
- Full **Nuxt 4** project generated from scratch — `nuxt.config.ts`, Nitro engine, hybrid rendering
- Vasp generates Nuxt-idiomatic code: `server/api/` routes for queries/actions, `composables/` for client access, `pages/` with file-based routing
- Auth guards via Nuxt middleware (`defineNuxtRouteMiddleware`)
- SSG pre-renders pages at build time; SSR renders per-request via Nitro edge functions

**Switching between modes** is done via `vasp enable-ssr` (or editing `ssr:` in `main.vasp`). The CLI regenerates the frontend scaffold from the correct template tree. Business logic files (`queries.js`, `actions.js`, etc.) are portable across both modes and are never regenerated.

> **Why not a single unified template?** A shared abstraction that hides SPA vs SSR differences is the single largest source of subtle bugs in full-stack frameworks. By keeping the two trees explicit and separate internally, Vasp can generate idiomatic, debuggable code for each target while still presenting a single `main.vasp` entry point to the developer.

#### 4.3 Backend
- Auto-generated **Elysia** server on **Bun**
- All queries, actions, CRUD, and realtime routes are automatically created
- Drizzle ORM fully integrated with automatic context injection
- Built-in auth middleware, CORS, rate limiting, validation

#### 4.4 Isomorphic HTTP Client (`$vasp`)

All data access from Vue components goes through a single `$vasp` composable, powered by **ofetch** under the hood. ofetch was chosen over Axios because it works identically in browser, Node.js, and Nitro server contexts with no environment shimming required — a critical property for SSR correctness.

```js
// Works in SPA, SSR (server render), and SSG (build-time fetch) — identical API
const { $vasp } = useVasp()
const todos = await $vasp.query('getTodos')
await $vasp.action('createTodo', { text: 'Buy milk' })
```

**How it works per mode:**

| Context | SPA | SSR (server render) | SSR (client hydration) |
|---|---|---|---|
| Underlying call | `ofetch` → Elysia API | Direct Nitro server function (no HTTP round-trip) | `ofetch` → Elysia API |
| Auth headers | Auto-injected via interceptor | Session passed via Nuxt `useRequestHeaders` | Auto-injected via interceptor |
| Type safety | Optional (TS mode) | Optional (TS mode) | Optional (TS mode) |

In SSR mode, Vasp generates a Nuxt plugin that wires `$vasp` to call server functions directly during the server render phase (zero latency, no network), and switches to standard `ofetch` HTTP calls on the client after hydration. The developer sees one composable; the transport layer is resolved automatically.

#### 4.5 Queries & Actions
- Auto-generated `@vasp/client` package exposing typed query/action wrappers
- Server functions receive `user` and `db` context automatically
- Full type safety when TypeScript is enabled

#### 4.6 CLI
```bash
vasp new my-app [--typescript] [--ssr] [--ssg]
vasp start
vasp build
vasp deploy
vasp migrate-to-ts
vasp enable-ssr
```

---

### 5. Project Structure (Generated)

```
my-app/
├── main.vasp
├── src/
│   ├── pages/
│   ├── components/
│   ├── queries.js/.ts
│   ├── actions.js/.ts
│   ├── jobs.js/.ts
│   └── lib/
├── drizzle/
│   └── schema.js/.ts
├── nuxt/                    ← Only generated when ssr/ssg enabled
├── tests/
├── bunfig.toml
├── vite.config.js           ← or nuxt.config.ts when SSR/SSG
├── tsconfig.json            ← Only when typescript: true
└── package.json
```

---

### 6. Non-Functional Requirements

- **Performance**: Revolutionary speed — dev loop, cold starts, bundle size, and edge deployment
- **Developer Experience**: Must feel magical; zero boilerplate even with TypeScript + Nuxt 4
- **Security**: Production-grade defaults (CORS, rate limiting, auth, validation, CSRF for SSR)
- **Maintainability**: Clean, well-commented generated code; modular compiler architecture
- **Compatibility**: Two explicit, fully tested modes (SPA and SSR/SSG) with 100% reliable switching via CLI
- **Error Handling**: Clear, actionable error messages pointing to `main.vasp` or user files

---

### 7. Architecture & Implementation Guidelines (For Builder)

**High-Level Architecture**
- **Parser**: Robust parser for `.vasp` files
- **Code Generator**: Two explicit template trees — one for SPA, one for SSR/SSG — sharing only business logic templates. Outputs:
  - Backend: Elysia + Bun + Drizzle (shared across both modes)
  - Frontend SPA: Vue 3 + Vite project
  - Frontend SSR/SSG: Full Nuxt 4 project (server/api/, composables/, pages/, Nitro)
  - Client: `@vasp/client` ofetch wrapper with optional full TypeScript types
- **Dev Server**: Simultaneous Bun backend + Vite/Nuxt frontend with hot reload
- **Build System**: Production-ready bundles for SPA or SSR/SSG

**Best Practices You Must Follow**
- Modular codebase (separate parser, generator, CLI, templates)
- Two explicit parallel template sets (SPA + SSR/SSG), each with JS and TS variants — four template trees total, shared business logic
- Generated code must be clean, readable, and easy to debug
- Use Bun native APIs wherever possible
- Security-first mindset (auto-validation, rate limiting, etc.)
- Excellent error messages and developer-friendly output
- Full test coverage for CLI and core generator
- MIT license from day one

**Recommended Build Order**
1. Parser + single end-to-end SPA flow (one query, one page, JS only)
2. TypeScript support for SPA
3. Auth (SPA)
4. Remaining SPA features (CRUD, realtime, jobs)
5. SSR/SSG Nuxt 4 template tree
6. TypeScript for SSR/SSG
7. Auth (SSR/SSG) + full parity with SPA feature set

---

### 8. Out of Scope for v1.0

- AI-assisted code generation
- Mobile (Tauri / Capacitor) support
- Plugin system
- Multi-tenant / advanced enterprise features

---