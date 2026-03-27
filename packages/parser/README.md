# @vasp-framework/parser

Lexer, recursive descent parser, and semantic validator for the `.vasp` DSL.

**Version: 1.4.2**

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
| `E038_INVALID_ENV_REQUIREMENT` | Invalid `app.env` requirement (must be `required` or `optional`) |
| `E039_DUPLICATE_ENV_KEY` | Duplicate key inside `app.env` |
| `E100_MISSING_APP_BLOCK` | No `app` block found |
| `E101_UNKNOWN_PAGE_REF` | Route `to` references undefined page |
| `E102_EMPTY_CRUD_OPERATIONS` | CRUD `operations` array is empty |
| `E103_UNKNOWN_CRUD_OPERATION` | Unknown CRUD operation |
| `E104_REALTIME_ENTITY_NOT_CRUD` | Realtime entity has no matching CRUD block |
| `E105_UNKNOWN_REALTIME_EVENT` | Unknown realtime event |
| `E106_EMPTY_AUTH_METHODS` | Auth `methods` array is empty |
| `E107_UNKNOWN_AUTH_METHOD` | Unknown auth method |
| `E108_UNKNOWN_ENTITY_REF` | Query references unknown entity |
| `E109_UNKNOWN_ENTITY_REF` | Action references unknown entity |
| `E110_UNKNOWN_JOB_EXECUTOR` | Unknown job executor |
| `E111_CRUD_ENTITY_NOT_DECLARED` | CRUD entity has no matching `entity` block |
| `E112_DUPLICATE_ENTITY` | Duplicate entity name |
| `E113_DUPLICATE_ROUTE_PATH` | Duplicate route path |
| `E114_INVALID_FIELD_TYPE` | Unsupported primitive field type |
| `E115_UNDEFINED_RELATION_ENTITY` | Relation field references unknown entity |
| `E116_UNKNOWN_API_METHOD` | API block uses unsupported HTTP method |
| `E117_DUPLICATE_API_ENDPOINT` | Duplicate API method+path combination |
| `E118_ROLES_WITHOUT_AUTH_CONFIG` | Roles used without `auth.roles` declaration |
| `E119_ROLES_REQUIRE_AUTH` | Roles used while `auth: false` |
| `E120_UNKNOWN_ROLE_REF` | Query/action/api references unknown role |
| `E121_UNKNOWN_MIDDLEWARE_SCOPE` | Unsupported middleware scope |
| `E122_INVALID_ENV_KEY` | `app.env` key is not uppercase snake case |

## License

[Apache 2.0](https://github.com/amirreza225/Vasp/blob/main/LICENSE)
