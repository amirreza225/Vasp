# Ssr Ts Debug

A full-stack app built with [Vasp](https://github.com/AliBeigi/Vasp).

## Getting Started

```bash
# Install dependencies
bun install

# Set up your database
# Make sure PostgreSQL is running, then push the schema:
bun run db:push

# Start the dev server (backend + frontend)
vasp start
```

## Project Structure

```
main.vasp          # Vasp declarative config
server/            # Elysia backend
  routes/          # API routes (queries, actions, CRUD)
  db/              # Drizzle DB client
  middleware/      # Rate limiting
src/               # Frontend source
  pages/           # Vue page components
  components/      # Shared components
drizzle/           # Database schema & migrations
```

## Scripts

| Command | Description |
|---------|-------------|
| `vasp start` | Start dev server (backend + frontend) |
| `vasp build` | Production build |
| `bun run db:push` | Push schema to database |
| `bun run db:generate` | Generate a migration |
| `bun run db:migrate` | Run migrations |
| `bun run db:studio` | Open Drizzle Studio |

## Environment Variables

Copy `.env.example` to `.env` and update the values:

- `DATABASE_URL` — PostgreSQL connection string
- `PORT` — Backend server port (default: 3001)
- `VITE_API_URL` — Frontend API base URL
