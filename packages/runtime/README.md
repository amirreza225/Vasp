# @vasp-framework/runtime

Runtime composables and client utilities shipped into Vasp-generated apps.

**Version: 1.1.0**

This package is automatically added as a dependency to every project created with `vasp new`. You don't install it manually — Vasp handles it.

## What's included

### `createVaspClient(options?)`

Creates the `$vasp` client used by the SPA plugin to call queries and actions:

```javascript
import { createVaspClient } from '@vasp-framework/runtime'

const client = createVaspClient({ baseURL: '/api' })

// Call a query
const todos = await client.query('getTodos')

// Call an action
await client.action('createTodo', { text: 'Buy milk' })
```

Uses [ofetch](https://github.com/unjs/ofetch) under the hood with `credentials: 'include'` for cookie-based auth.

### `useQuery(name, args?)`

Reactive query composable. Auto-fetches on component mount:

```javascript
import { useQuery } from '@vasp-framework/runtime'

const { data: todos, loading, error, refresh } = useQuery('getTodos')
```

Returns: `{ data: Ref<T|null>, loading: Ref<boolean>, error: Ref<Error|null>, refresh(): Promise<void> }`

### `useAction(name)`

Reactive action composable. Call `execute()` to trigger:

```javascript
import { useAction } from '@vasp-framework/runtime'

const { execute: createTodo, loading, error } = useAction('createTodo')
await createTodo({ text: 'Buy milk' })
```

Returns: `{ execute(args?): Promise<T>, loading: Ref<boolean>, error: Ref<Error|null> }`

### `useAuth()`

Reactive authentication composable:

```javascript
import { useAuth } from '@vasp-framework/runtime'

const { user, isAuthenticated, loading, error, login, register, logout, refresh } = useAuth()

await login({ username: 'admin', password: 'secret' })
await register({ username: 'new', password: 'pass123' })
await logout()
```

Auto-fetches the current user on creation via `$vasp.query('auth/me')`. Returns reactive state (`user`, `loading`, `error`, `isAuthenticated`) and methods (`login`, `register`, `logout`, `refresh`).

### `installVasp(app, options?)` / `useVasp()`

Vue plugin + composable for accessing `$vasp` anywhere in your app:

```javascript
import { installVasp, useVasp } from '@vasp-framework/runtime'

// In main.js (generated automatically by Vasp)
app.use({ install: (app) => installVasp(app, { baseURL: '/api' }) })

// In any component
const { $vasp } = useVasp()
const todos = await $vasp.query('getTodos')
```

## SSR mode

In SSR (Nuxt 4) mode, this package is **not used directly**. Instead, Vasp generates two Nuxt plugins:

- `plugins/vasp.server.js` — calls server functions directly during SSR render (zero HTTP overhead)
- `plugins/vasp.client.js` — uses ofetch on the client after hydration

The developer always sees the same `useVasp()` API regardless of mode.

## License

[Apache 2.0](../../LICENSE)
