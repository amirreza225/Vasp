# Vasp VS Code Extension

The official VS Code extension for the [Vasp](https://github.com/amirreza225/Vasp) declarative full-stack framework.

## Features

- **Syntax highlighting** — all 20 block types, field modifiers, primitive types, executors, providers
- **Code snippets** — 22 scaffolds for every block type with tab-stops (including PgBoss/BullMQ and inbound/outbound webhook variants)
- **Diagnostics** — real-time parse errors and semantic validation powered by the Chevrotain language server (undefined entity refs, realtime without CRUD, etc.) with 300 ms debounce
- **Completions** — context-aware completions across 15 contexts: block keywords at top-level, sub-block keywords inside `crud {}` / `entity {}`, entity names after `entity:`, page names after `to:`, executor/provider enums with full auto-insert snippets
- **Hover documentation** — inline Markdown docs for every keyword and block type
- **Go-to-Definition** — jump to entity or page declarations across all `.vasp` files in the workspace (multi-file support)

## Requirements

- VS Code 1.90+
- Node.js or Bun (to run the language server)
- A workspace containing one or more `.vasp` files

## Usage

Open any `.vasp` file — the extension activates automatically and starts the language server in the background.

---

## Building the Extension

The extension lives in `packages/vscode-extension/` and depends on the language server in `packages/language-server/`.

### Prerequisites

```bash
# Install all monorepo deps (from the repo root)
bun install
```

### Step 1 — Build the language server

The extension shell-spawns `@vasp-framework/language-server` as a child process. Build it first:

```bash
cd packages/language-server
bun run build
# Output: packages/language-server/dist/server.js
```

### Step 2 — Build the extension host

```bash
cd packages/vscode-extension
bun run build
# Output: packages/vscode-extension/dist/extension.js
```

Or watch for changes during development:

```bash
cd packages/vscode-extension
bun run watch
```

### Step 3 — Run in development mode (without packaging)

1. Open the **monorepo root** in VS Code.
2. Press **F5** (or go to **Run → Start Debugging**).
   VS Code launches an **Extension Development Host** window with the extension loaded.
3. Open or create any `.vasp` file in that window to activate the extension.

> **Note:** The language server path is resolved by the `VASP_LS_PATH` environment variable when set, or falls back to `language-server/dist/server.js` relative to the extension root. In development, set the variable if the dist folder is not co-located:
> ```bash
> export VASP_LS_PATH=$(pwd)/packages/language-server/dist/server.js
> code .
> ```

To enable the F5 workflow, add this `.vscode/launch.json` to the repo root:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Vasp Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": ["--extensionDevelopmentPath=${workspaceFolder}/packages/vscode-extension"],
      "env": {
        "VASP_LS_PATH": "${workspaceFolder}/packages/language-server/dist/server.js"
      },
      "outFiles": ["${workspaceFolder}/packages/vscode-extension/dist/**/*.js"],
      "preLaunchTask": "Build Extension"
    }
  ]
}
```

And add `.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Build Extension",
      "type": "shell",
      "command": "bun run build",
      "options": { "cwd": "${workspaceFolder}/packages/vscode-extension" },
      "group": "build"
    }
  ]
}
```

### Step 4 — Package as a `.vsix` installable file

```bash
# Install the VS Code Extension CLI (once)
bun add -g @vscode/vsce

# Copy the built language server next to the extension so it is bundled
mkdir -p packages/vscode-extension/language-server
cp -r packages/language-server/dist packages/vscode-extension/language-server/dist

# Package the extension
cd packages/vscode-extension
# --no-dependencies avoids npm trying to re-resolve the monorepo workspace tree
bunx @vscode/vsce package --no-dependencies
# Produces: vasp-vscode-0.1.0.vsix
```

### Step 5 — Install the `.vsix` locally

```bash
# From the repo root
code --install-extension packages/vscode-extension/vasp-vscode-0.1.0.vsix
```

Or via VS Code UI: **Extensions → ⋯ → Install from VSIX…** → select the file.

### Step 6 — Publish to the VS Code Marketplace (optional)

```bash
# Create a Personal Access Token at https://dev.azure.com (Marketplace → Manage Publishers)
# and set it:
export VSCE_PAT=<your-pat>

cd packages/vscode-extension
npx @vscode/vsce publish
```

You will need to update `publisher` in `package.json` to your own publisher ID before publishing.

---

## Extension Settings

No settings are required. The language server starts automatically when you open a `.vasp` file.

## License

MIT
