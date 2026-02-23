# sandctl (TypeScript + Bun)

This directory contains the TypeScript rewrite of `sandctl`.

## Prerequisites

- Bun 1.x

## Build

```bash
cd sandctl-ts
bun install
bun run build
```

## Install

```bash
make install
```

## Cross-compile

```bash
make build-all
```

## Quick Start

```bash
cd sandctl-ts
bun install
bun run build
./sandctl --help
./sandctl version
```

## Verification

### Default local checks

Run these from the repository root:

```bash
~/.bun/bin/bun run --cwd sandctl-ts lint
~/.bun/bin/bun test sandctl-ts/tests/unit/
~/.bun/bin/bun test sandctl-ts/tests/e2e/cli.test.ts sandctl-ts/tests/e2e/live-smoke.test.ts
~/.bun/bin/bun run --cwd sandctl-ts build
```

Notes:
- `tests/e2e/live-smoke.test.ts` is included in the default e2e command, but live infrastructure checks remain skipped unless explicitly enabled.

### Opt-in live smoke checks

To run the real cloud smoke flow (`new -> list -> exec -> destroy`), provide credentials and opt in:

```bash
SANDCTL_LIVE_SMOKE=1 HETZNER_API_TOKEN=<token> ~/.bun/bin/bun test sandctl-ts/tests/e2e/live-smoke.test.ts
```

## SSH Runtime Parity Notes

- SSH agent discovery and console behavior are tested with injected runtime/platform data so parity checks stay OS-independent.
- Run `bun test tests/unit/ssh/macos-parity.test.ts` to validate macOS path/terminal assumptions without requiring macOS at runtime.
