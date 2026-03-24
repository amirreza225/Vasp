# @vasp-framework/parser

Lexer, recursive descent parser, and semantic validator for the `.vasp` DSL.

This is an internal package used by `vasp-cli` and `@vasp-framework/generator`. You don't need to install it unless you're building custom Vasp tooling.

## Usage

```typescript
import { parse } from '@vasp-framework/parser'

const ast = parse(`
  app MyApp {
    title: "My App"
    db: Drizzle
    ssr: false
    typescript: false
  }

  route HomeRoute {
    path: "/"
    to: HomePage
  }

  page HomePage {
    component: import Home from "@src/pages/Home.vue"
  }
`)

console.log(ast.app.name)    // 'MyApp'
console.log(ast.routes[0])   // { type: 'Route', name: 'HomeRoute', path: '/', to: 'HomePage', ... }
```

## API

### `parse(source: string, filename?: string): VaspAST`

Tokenizes, parses, and semantically validates a `.vasp` source string. Throws `ParseError` on any error.

```typescript
import { parse } from '@vasp-framework/parser'
import { ParseError } from '@vasp-framework/core'

try {
  const ast = parse(source, 'main.vasp')
} catch (err) {
  if (err instanceof ParseError) {
    console.error(err.message)   // '[E010_UNEXPECTED_TOKEN] (line 3, col 5): ...'
    console.log(err.diagnostics) // structured list of errors with codes, messages, locations
  }
}
```

## Error Codes

| Code | Description |
|---|---|
| `E001_UNCLOSED_BLOCK_COMMENT` | Block comment `/* ... */` was never closed |
| `E002_INVALID_CHARACTER` | Unexpected character in source |
| `E003_UNTERMINATED_STRING` | String literal missing closing quote |
| `E010_UNEXPECTED_TOKEN` | Parser got a token it didn't expect |
| `E011_DUPLICATE_BLOCK` | Block name already defined |
| `E100_MISSING_APP_BLOCK` | No `app` block found |
| `E105_INVALID_ROUTE_REF` | `route.to` references unknown page |
| `E108_UNKNOWN_ENTITY_REF` | Query/action references unknown entity |

## License

[Apache 2.0](../../LICENSE)
