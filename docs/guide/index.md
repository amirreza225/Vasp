# Introduction

Vasp is a declarative full-stack framework for Vue developers. You define your app in a `.vasp` file, and Vasp generates a complete app with a Bun + Elysia backend, Drizzle schema, and Vue 3 or Nuxt 4 frontend.

## Why teams choose Vasp

| Layer | Technology |
|---|---|
| Runtime | Bun |
| Backend | Elysia |
| ORM | Drizzle |
| Frontend | Vue 3 + Vite (SPA) or Nuxt 4 (SSR/SSG) |
| Client SDK | `@vasp-framework/runtime` composables (`$vasp`, `useAuth`, etc.) |
| DSL | `.vasp` |

## What you write vs. what Vasp generates

You write:
- `main.vasp` blocks
- Business logic functions (`queries`, `actions`, jobs, middleware)
- UI components

Vasp generates:
- Server routes and middleware wiring
- Drizzle schema and database helpers
- Runtime client integration
- Frontend scaffolding and route plumbing

::: info
> Vasp is intentionally explicit: SPA and SSR/SSG are distinct modes controlled by `app.ssr`.

## Next steps

1. [Install prerequisites](/guide/installation)
2. [Create your first project](/guide/create-project)
3. Learn the [DSL reference](/dsl/)
