.PHONY: build build-all test lint fmt check-fmt clean install generate-version
.RECIPEPREFIX := >

BINARY_NAME = sandctl
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
COMMIT ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_TIME ?= $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")

generate-version:
>@printf 'export const VERSION = "%s";\nexport const COMMIT = "%s";\nexport const BUILD_TIME = "%s";\n' "$(VERSION)" "$(COMMIT)" "$(BUILD_TIME)" > src/version.ts

build: generate-version
>bun build src/index.ts --compile --outfile $(BINARY_NAME)

build-all:
>./scripts/build-all.sh

test:
>bun test

lint:
>bun run lint

fmt:
>bun run fmt

check-fmt:
>bun run check-fmt

clean:
>rm -f $(BINARY_NAME)

install: build
>cp $(BINARY_NAME) /usr/local/bin/$(BINARY_NAME)
