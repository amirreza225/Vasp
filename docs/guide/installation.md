# Installation

## Prerequisites

- [Bun](https://bun.sh) (recommended, latest stable)
- Git

## Install Vasp CLI

```bash
bun install -g vasp-cli
```

Verify installation:

```bash
vasp --version
```

## Monorepo contributors

If you are working on the Vasp framework itself:

```bash
git clone https://github.com/amirreza225/Vasp
cd Vasp
bun install
bun run build
```

::: tip
Bun is the primary package manager in this repository. npm can still run docs scripts if needed (`npm run docs:dev`).
:::
