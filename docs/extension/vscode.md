# VS Code Extension

The Vasp VS Code extension provides first-class `.vasp` editing.

## Capabilities

- Syntax highlighting for all DSL blocks and modifiers
- Snippets for common block scaffolds
- Real-time diagnostics
- Context-aware completions
- Hover documentation
- Go-to-definition across `.vasp` files

## Build from source

```bash
cd packages/language-server && bun run build
cd packages/vscode-extension && bun run build
mkdir -p packages/vscode-extension/language-server
cp -r packages/language-server/dist packages/vscode-extension/language-server/dist
cd packages/vscode-extension && npx @vscode/vsce package
code --install-extension packages/vscode-extension/vasp-vscode-0.1.0.vsix
```
