# sandctl Development Guidelines

## Overview

sandctl is a CLI tool for managing sandboxed VMs on Hetzner Cloud. The implementation is in TypeScript/Bun, located in `sandctl-ts/`.

## Active Technologies

- TypeScript + Bun (runtime and bundler)
- Commander.js (CLI framework)
- ssh2 (SSH client)
- Biome (linting and formatting)

## Project Structure

```text
sandctl-ts/
├── src/
│   ├── commands/       # CLI command implementations
│   ├── config/         # Config file handling (~/.sandctl/config)
│   ├── hetzner/        # Hetzner Cloud provider
│   ├── provider/       # Provider interface and registry
│   ├── session/        # Session management (~/.sandctl/sessions.json)
│   ├── ssh/            # SSH client, console, exec
│   ├── template/       # Template management
│   └── utils/          # Shared utilities
├── tests/
│   ├── unit/           # Unit tests
│   ├── e2e/            # E2E and contract tests
│   └── support/        # Test fixtures
└── biome.json          # Linter/formatter config
```

## Commands

```bash
cd sandctl-ts

# Install dependencies
bun install

# Run unit tests
bun test tests/unit/

# Run linter
bun run lint

# Build binary
bun run build

# Run e2e tests (requires HETZNER_API_TOKEN)
bun test tests/e2e/
```

## Code Style

- Biome for linting and formatting — run `bun run lint` before committing
- Import ordering is enforced (node: → third-party → @/ aliases)
- No non-null assertions — use early returns or narrowing instead

## CI Checks

All must pass before merging: `lint`, `build`, `test`, `contract-tests`, `e2e`

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
