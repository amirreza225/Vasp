**Product Requirements Document (PRD)**  
**Vasp Framework**  
**Version:** 1.0 (Complete First Release)  
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
- Client ↔ Server: **Axios**
- File format: `.vasp` (branded and clear)

Developers can start with pure JS + SPA in under 5 seconds and seamlessly upgrade to TypeScript + Nuxt 4 SSR/SSG with a single CLI flag — **without ever leaving the magical `main.vasp` workflow**.

**Tagline:**  
“Wasp magic for Vue — now with Bun + Elysia speed, Drizzle simplicity, full TypeScript support, and Nuxt 4 SSR/SSG.”

This is the **complete, production-ready v1.0 PRD**. It contains everything needed to build the first full version of Vasp.

---

### 2. Product Goals

- Provide the **fastest possible full-stack development experience** for Vue developers in 2026.
- Maintain zero-boilerplate, declarative workflow (`main.vasp` + your code).
- Support both hobbyists (pure JS + SPA) and professional teams (TypeScript + Nuxt 4 SSR/SSG).
- Deliver production-grade security, performance, and scalability from day one.
- Be fully open-source (MIT license).

**Success Metrics**
- `vasp new my-app` completes in < 5 seconds.
- Dev server starts in < 50 ms.
- Full Todo + Auth + SSR example works out-of-the-box.
- Generated code is clean, readable, and follows modern best practices.
- 100 % backward compatibility between JS/TS and SPA/SSR modes.

---

### 3. Technical Stack

| Layer                  | Technology                                      | Default / Opt-in          | Reason |
|------------------------|-------------------------------------------------|---------------------------|--------|
| Runtime                | **Bun** (primary) + Node.js fallback            | Default                   | Fastest JS runtime in 2026 |
| Backend Framework      | **Elysia**                                      | Default                   | Fastest framework on Bun |
| ORM                    | **Drizzle**                                     | Default                   | Lightest bundle, fastest queries |
| Frontend               | **Vue 3 + Vite** (SPA) **or** **Nuxt 4** (SSR/SSG) | Opt-in (Nuxt 4)           | Best DX + SSR/SSG |
| Language               | **Pure JavaScript** + **full TypeScript support** | JS default, TS opt-in     | Maximum flexibility |
| HTTP Client            | **Axios**                                       | Default                   | Reliable, familiar, excellent Vue integration |
| Config DSL             | Custom `.vasp` files (`main.vasp`)              | Default                   | Single source of truth |

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

#### 4.2 Frontend
- **SPA Mode** (default): Pure Vue 3 + Vite + Vue Router
- **SSR / SSG Mode**: Full **Nuxt 4** integration (auto-generated `nuxt.config.ts`, Nitro engine, hybrid rendering)
- Global `$vasp` Axios instance injected into every component (works in SPA and SSR)
- Automatic routing, layouts, and auth guards

#### 4.3 Backend
- Auto-generated **Elysia** server on **Bun**
- All queries, actions, CRUD, and realtime routes are automatically created
- Drizzle ORM fully integrated with automatic context injection
- Built-in auth middleware, CORS, rate limiting, validation

#### 4.4 Queries & Actions
- Auto-generated Axios client (`@vasp/client`)
- Server functions receive `user` and `db` context automatically
- Full type safety when TypeScript is enabled

#### 4.5 CLI
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
- **Compatibility**: 100 % seamless switching between JS/TS and SPA/SSR/SSG
- **Error Handling**: Clear, actionable error messages pointing to `main.vasp` or user files

---

### 7. Architecture & Implementation Guidelines (For Builder)

**High-Level Architecture**
- **Parser**: Robust parser for `.vasp` files
- **Code Generator**: Outputs:
  - Backend: Elysia + Bun + Drizzle
  - Frontend: Vue 3 + Vite **or** full Nuxt 4 project
  - Client: Axios wrapper with optional full TypeScript types
- **Dev Server**: Simultaneous Bun backend + Vite/Nuxt frontend with hot reload
- **Build System**: Production-ready bundles for SPA or SSR/SSG

**Best Practices You Must Follow**
- Modular codebase (separate parser, generator, CLI, templates)
- Two parallel template sets (JS + TS) with shared logic
- Generated code must be clean, readable, and easy to debug
- Use Bun native APIs wherever possible
- Security-first mindset (auto-validation, rate limiting, etc.)
- Excellent error messages and developer-friendly output
- Full test coverage for CLI and core generator
- MIT license from day one

---

### 8. Out of Scope for v1.0

- AI-assisted code generation
- Mobile (Tauri / Capacitor) support
- Plugin system
- Multi-tenant / advanced enterprise features

---