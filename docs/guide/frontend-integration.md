# Frontend Integration

## Two frontend modes

### SPA (`ssr: false`)
- Vue 3 + Vite + Vue Router
- Great for dashboards and internal tools

### SSR / SSG (`ssr: true` or `ssr: "ssg"`)
- Nuxt 4 application
- SSR for per-request rendering, SSG for pre-rendered static pages

## Runtime composables

Vasp apps use `@vasp-framework/runtime` helpers.

```ts
const { $vasp } = useVasp()
const todos = await $vasp.query('getTodos')
await $vasp.action('createTodo', { title: 'Ship docs' })
```

Authentication helper:

```ts
import { useAuth } from '@vasp-framework/runtime'

const { user, isAuthenticated, login, register, logout } = useAuth()
```

::: info
The `$vasp` client is based on `ofetch`, and works consistently across SPA and SSR.
:::
