# @vasp-framework/language-server

LSP server for `.vasp` files. Provides diagnostics, completions, hover documentation, and go-to-definition for the Vasp DSL.

This is an internal package. Most users interact with it indirectly through the [`vasp-vscode`](../vscode-extension/README.md) extension. Install that instead.

---

## Features

| Feature | Details |
|---------|---------|
| Diagnostics | Real-time parse errors + semantic validation (300 ms debounce) |
| Completions | 15+ context states — entity names, page names, executor/provider enums with auto-insert snippets. Trigger characters: `:`, space, `{` |
| Hover docs | Inline Markdown documentation for every keyword and modifier |
| Go-to-Definition | Jump to entity/page declarations across all `.vasp` files in the workspace |

---

## Transport

The server communicates over **stdio** and is spawned as a child process by the VS Code extension. The extension uses the `VASP_LS_PATH` environment variable to locate the server binary; it defaults to `language-server/dist/server.js` relative to the extension root.

---

## Build

```bash
# One-time build
bun run build   # output: dist/server.js

# Watch mode (rebuilds on source change)
bun run watch

# Tests
bun run test
```

---

## Source layout

```
src/
├── server.ts                  # Main entry point — creates LSP connection
├── index.ts                   # Public exports (for testing and external tooling)
├── grammar/
│   └── VaspDocScanner.ts      # Document scanning using the real Lexer
├── features/
│   ├── diagnostics.ts         # Parse + semantic validation
│   ├── completions.ts         # Context-aware completions
│   ├── hover.ts               # Hover documentation
│   └── definition.ts          # Go-to-definition
└── utils/
    ├── context-detector.ts    # Cursor position analysis
    ├── document-store.ts      # In-memory document store
    └── vasp-docs.ts           # Built-in keyword documentation
```

---

## Public exports (`index.ts`)

| Export | Description |
|--------|-------------|
| `parseDocument(text)` | Parse a `.vasp` source string into a `DocumentAST` |
| `validateDocument(ast)` | Run semantic validation and return diagnostics |
| `getCompletions(store, uri, position)` | Get completion items at a cursor position |
| `detectCursorContext(tokens, offset)` | Determine the DSL context at a token offset |
| `VaspDocumentStore` | In-memory store for multi-file workspace support |

---

## License

[Apache 2.0](https://github.com/amirreza225/Vasp/blob/main/LICENSE)
