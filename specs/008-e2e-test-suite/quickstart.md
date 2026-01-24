# Quickstart: E2E Test Suite

**Feature**: 008-e2e-test-suite
**Date**: 2026-01-24

## Prerequisites

1. Go 1.23.0+ installed
2. Valid Sprites API token

## Running E2E Tests

### Set Environment Variables

```bash
export SPRITES_API_TOKEN="your-api-token-here"
# Optional: export OPENCODE_ZEN_KEY="your-opencode-key"
```

### Run All E2E Tests

```bash
go test -v -tags=e2e ./tests/e2e/...
```

### Run Specific Test

```bash
go test -v -tags=e2e -run "TestSandctl/sandctl_version" ./tests/e2e/...
```

### Run with Timeout (for CI)

```bash
go test -v -tags=e2e -timeout 10m ./tests/e2e/...
```

## Test Output

Successful run shows test names with pass/fail:

```
=== RUN   TestSandctl
=== RUN   TestSandctl/sandctl_version_>_displays_version_information
--- PASS: TestSandctl/sandctl_version_>_displays_version_information (0.05s)
=== RUN   TestSandctl/sandctl_init_>_creates_config_file
--- PASS: TestSandctl/sandctl_init_>_creates_config_file (0.10s)
=== RUN   TestSandctl/workflow_>_complete_session_lifecycle
    cli_test.go:XX: starting session: e2e-test-abc123-1706108400
    cli_test.go:XX: session ready
    cli_test.go:XX: executing command in session
    cli_test.go:XX: destroying session
--- PASS: TestSandctl/workflow_>_complete_session_lifecycle (125.00s)
--- PASS: TestSandctl (125.15s)
PASS
ok      github.com/sandctl/sandctl/tests/e2e    125.200s
```

## Troubleshooting

### "SPRITES_API_TOKEN not set"

Set the environment variable before running tests:
```bash
export SPRITES_API_TOKEN="your-token"
```

### "failed to build sandctl binary"

Ensure Go modules are downloaded:
```bash
go mod download
```

### Test Timeout

Session provisioning can take 1-2 minutes. Use `-timeout 10m` flag for CI.

### Orphaned Sessions

If tests fail unexpectedly, sessions may remain. List and clean up:
```bash
sandctl list -a
sandctl destroy <session-name>
```

## Development Workflow

1. Make changes to sandctl code
2. Run unit tests: `go test ./...`
3. Run e2e tests: `go test -v -tags=e2e ./tests/e2e/...`
4. Commit when both pass
