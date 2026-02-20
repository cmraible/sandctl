#!/usr/bin/env bash
set -euo pipefail

bun build src/index.ts --compile --target=bun-darwin-arm64 --outfile sandctl-darwin-arm64
bun build src/index.ts --compile --target=bun-darwin-x64 --outfile sandctl-darwin-x64
bun build src/index.ts --compile --target=bun-linux-x64 --outfile sandctl-linux-x64
bun build src/index.ts --compile --target=bun-linux-arm64 --outfile sandctl-linux-arm64
