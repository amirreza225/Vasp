---
layout: home

hero:
  name: Vasp
  text: Declarative full-stack framework for Vue developers
  tagline: Build Bun + Elysia + Drizzle + Vue/Nuxt apps from one `.vasp` file.
  image:
    src: /logo.svg
    alt: Vasp logo
  actions:
    - theme: brand
      text: Get Started
      link: /guide/
    - theme: alt
      text: DSL Reference
      link: /dsl/
    - theme: alt
      text: GitHub
      link: https://github.com/amirreza225/Vasp

features:
  - title: Declarative by design
    details: Define app architecture in `main.vasp`; generate backend, frontend, auth, and data layers automatically.
  - title: Production-ready stack
    details: Bun runtime, Elysia server, Drizzle ORM, Vue 3 SPA or Nuxt 4 SSR/SSG with modern defaults.
  - title: Powerful CLI
    details: Create, validate, generate, migrate, deploy, and evolve apps with a complete command set.
  - title: Strong DX and tooling
    details: TypeScript support, runtime composables, semantic validation, language server, and VS Code extension.
  - title: Rich feature surface
    details: Auth, CRUD, realtime, jobs, storage, email, cache, webhooks, multi-tenancy, RBAC, observability.
  - title: Extensible architecture
    details: Plugin system for custom generators, Handlebars helpers, and template overrides.
---

## Quick Start

```bash
# Install the CLI
bun install -g vasp-cli

# Create a project (interactive)
vasp new my-app

# Or use flags
vasp new my-app --typescript --ssr

cd my-app
vasp start
```

## How Vasp Works

```mermaid
flowchart LR
  A[main.vasp] --> B[Lexer + Parser]
  B --> C[Semantic Validator]
  C --> D[Generator Pipeline]
  D --> E[Backend + Frontend + Runtime Files]
  E --> F[Run with Bun]
```

::: tip
This docs site is organized for both first-time users and advanced teams. Start with **Guide**, then move to **DSL**, **CLI**, and **Features**.
:::
