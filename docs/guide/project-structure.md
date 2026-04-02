# Generated Project Structure

A typical generated app looks like this:

```text
my-app/
├── main.vasp
├── vasp.config.ts
├── src/
│   ├── pages/
│   ├── components/
│   ├── queries.ts/js
│   ├── actions.ts/js
│   ├── jobs.ts/js
│   └── admin/ (if admin enabled)
├── server/
│   ├── index.ts/js
│   ├── db/
│   ├── middleware/
│   └── routes/
├── drizzle/
├── nuxt/ (SSR/SSG mode only)
└── package.json
```

## Important directories

- `server/`: Elysia API routes, middleware, and integrations
- `drizzle/`: schema and migration config
- `src/`: application logic and UI components
- `src/admin/`: generated admin UI when `admin` block exists

## Regeneration model

Vasp uses safe regeneration with a manifest/staging strategy, so repeated `vasp generate` updates framework-managed files while preserving your custom app code.
