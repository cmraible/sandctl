#!/usr/bin/env bash
set -euo pipefail

VERSION="${VERSION:-$(git describe --tags --always --dirty 2>/dev/null || echo "dev")}"
COMMIT="${COMMIT:-$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")}"
BUILD_TIME="${BUILD_TIME:-$(date -u +"%Y-%m-%dT%H:%M:%SZ")}"

printf 'export const VERSION = "%s";\nexport const COMMIT = "%s";\nexport const BUILD_TIME = "%s";\n' "$VERSION" "$COMMIT" "$BUILD_TIME" > src/version.ts
bun build src/index.ts --compile --outfile sandctl
