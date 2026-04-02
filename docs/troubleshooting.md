# Troubleshooting

## `vasp generate` failed

- Run `vasp validate --strict` to get semantic details.
- Check entity and route references for typos.
- Verify block dependencies (for example realtime requires CRUD).

## SSR auth redirects unexpectedly

Ensure your auth setup is generated and your frontend mode/config matches `app.ssr`.

## Build/type errors after changing DSL

Regenerate after edits:

```bash
vasp generate --force
```

Then reinstall/build if needed:

```bash
bun install
bun run build
```

## CLI command missing

Confirm global install:

```bash
bun install -g vasp-cli
vasp --version
```
