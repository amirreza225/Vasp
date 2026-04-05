# Contributing Documentation

## Docs structure

All documentation lives in `/docs`:

- `.vitepress/config.ts` for nav, sidebar, and site settings
- `.vitepress/theme/` for style customization
- section folders (`guide/`, `dsl/`, `cli/`, `features/`, etc.) for page content

## Adding a new page

1. Create the markdown file in the right section.
2. Add it to the sidebar in `docs/.vitepress/config.ts`.
3. Use clear headings, code fences, and callouts.
4. Run local docs build before opening a PR.

## Local docs commands

```bash
bun run docs:dev
bun run docs:build
bun run docs:preview
```

## Writing style

- Prefer practical examples over abstract text.
- Keep beginner-first explanations while preserving advanced depth.
- Use admonitions (`NOTE`, `TIP`, `WARNING`, `DANGER`) for important guidance.
