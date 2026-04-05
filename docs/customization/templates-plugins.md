# Customization and Extensibility

Use `vasp.config.ts` to extend generation without forking.

## Plugin extension points

- Custom generators
- Template overrides
- Handlebars helpers

```ts
import type { VaspPlugin } from '@vasp-framework/core'

const plugin: VaspPlugin = {
  name: 'acme-plugin',
  generators: [
    {
      name: 'VersionFileGenerator',
      run(ctx, write) {
        write(`src/version.${ctx.ext}`, `export const APP = "${ctx.ast.app?.title}"\n`)
      },
    },
  ],
}

export default { plugins: [plugin] }
```

::: danger
Keep generated template overrides aligned with upstream changes when upgrading Vasp versions.
:::
