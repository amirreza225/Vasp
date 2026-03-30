# Vasp VS Code Extension

The official VS Code extension for the [Vasp](https://github.com/amirreza225/Vasp) declarative full-stack framework.

## Features

- **Syntax highlighting** — all 20 block types, field modifiers, primitive types, executors, providers
- **Code snippets** — scaffolds for every block type with tab-stops
- **Diagnostics** — real-time parse errors and semantic validation (undefined entity refs, realtime without CRUD, etc.)
- **Completions** — context-aware completions: block keywords at top-level, sub-block keywords inside `crud {}`, entity names after `entity:`, page names after `to:`, executor/provider enums with auto-insert snippets
- **Hover documentation** — inline Markdown docs for every keyword
- **Go-to-Definition** — jump to entity or page declarations across all `.vasp` files in the workspace

## Requirements

- VS Code 1.90+
- A workspace containing one or more `.vasp` files

## Usage

Open any `.vasp` file — the extension activates automatically.

## Extension Settings

No settings are required. The language server starts automatically when you open a `.vasp` file.

## License

MIT
