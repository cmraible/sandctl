#!/usr/bin/env bash
set -euo pipefail

VERSION="${VERSION:-$(git describe --tags --always --dirty 2>/dev/null || echo "dev")}"
COMMIT="${COMMIT:-$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")}"
BUILD_TIME="${BUILD_TIME:-$(date -u +"%Y-%m-%dT%H:%M:%SZ")}"

BUN_BIN="${BUN_BIN:-$(command -v bun || true)}"
if [[ -z "$BUN_BIN" && -x "$HOME/.bun/bin/bun" ]]; then
	BUN_BIN="$HOME/.bun/bin/bun"
fi

if [[ -z "$BUN_BIN" ]]; then
	echo "bun executable not found; install bun or set BUN_BIN" >&2
	exit 127
fi

printf 'export const VERSION = "%s";\nexport const COMMIT = "%s";\nexport const BUILD_TIME = "%s";\n' "$VERSION" "$COMMIT" "$BUILD_TIME" > src/version.ts
"$BUN_BIN" build src/index.ts --compile --outfile sandctl
