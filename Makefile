.PHONY: build test test-unit test-integration test-e2e lint install clean help

# Build variables
BINARY_NAME=sandctl
BUILD_DIR=build
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
COMMIT ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_TIME ?= $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")
LDFLAGS=-ldflags "-X main.version=$(VERSION) -X main.commit=$(COMMIT) -X main.buildTime=$(BUILD_TIME)"

# Go commands
GOCMD=go
GOBUILD=$(GOCMD) build
GOTEST=$(GOCMD) test
GOGET=$(GOCMD) get
GOMOD=$(GOCMD) mod
GOFMT=gofmt

help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

build: ## Build the binary
	@mkdir -p $(BUILD_DIR)
	$(GOBUILD) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME) ./cmd/sandctl

build-all: ## Build for all platforms
	@mkdir -p $(BUILD_DIR)
	GOOS=darwin GOARCH=arm64 $(GOBUILD) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME)-darwin-arm64 ./cmd/sandctl
	GOOS=darwin GOARCH=amd64 $(GOBUILD) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME)-darwin-amd64 ./cmd/sandctl
	GOOS=linux GOARCH=amd64 $(GOBUILD) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME)-linux-amd64 ./cmd/sandctl
	GOOS=linux GOARCH=arm64 $(GOBUILD) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME)-linux-arm64 ./cmd/sandctl

test: ## Run tests
	$(GOTEST) -v -race -cover ./...

test-unit: ## Run unit tests only
	$(GOTEST) -v -race -cover ./internal/...

test-integration: ## Run integration tests only
	$(GOTEST) -v -race ./tests/integration/...

test-e2e: ## Run E2E tests (requires SPRITES_API_TOKEN)
	$(GOTEST) -v -tags=e2e -timeout 5m ./tests/e2e/...

lint: ## Run linters
	golangci-lint run ./...

fmt: ## Format code
	$(GOFMT) -s -w .
	goimports -w -local github.com/sandctl/sandctl .

install: build ## Install binary to GOPATH/bin
	@mkdir -p $(shell go env GOPATH)/bin
	cp $(BUILD_DIR)/$(BINARY_NAME) $(shell go env GOPATH)/bin/$(BINARY_NAME)

install-local: build ## Install binary to /usr/local/bin
	sudo cp $(BUILD_DIR)/$(BINARY_NAME) /usr/local/bin/$(BINARY_NAME)

clean: ## Remove build artifacts
	rm -rf $(BUILD_DIR)
	$(GOCMD) clean -cache

deps: ## Download dependencies
	$(GOMOD) download
	$(GOMOD) tidy

vuln: ## Run vulnerability check
	govulncheck ./...

.DEFAULT_GOAL := help
