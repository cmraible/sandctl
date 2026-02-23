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

"$BUN_BIN" build src/index.ts \
	--compile \
	--outfile sandctl \
	--define __SANDCTL_VERSION__="\"$VERSION\"" \
	--define __SANDCTL_COMMIT__="\"$COMMIT\"" \
	--define __SANDCTL_BUILD_TIME__="\"$BUILD_TIME\""
