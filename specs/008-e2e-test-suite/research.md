# Research: E2E Test Suite Improvement

**Feature**: 008-e2e-test-suite
**Date**: 2026-01-24

## Research Topics

### 1. Go CLI Testing Best Practices

**Decision**: Use `os/exec.Command` to invoke the compiled sandctl binary

**Rationale**:
- True e2e testing requires invoking the actual CLI binary users would run
- `exec.Command` provides full control over stdin, stdout, stderr, and exit codes
- Allows testing exact command-line argument parsing behavior
- Standard approach in Go CLI projects (Cobra, Kong, etc.)

**Alternatives considered**:
- `cmd.Execute()` direct invocation: Rejected - doesn't test CLI parsing, flag handling
- `testing/quick`: Not applicable for CLI testing
- External test frameworks (Ginkgo, etc.): Unnecessary complexity for this scope

### 2. Test Binary Building Strategy

**Decision**: Build binary in `TestMain` before tests run, use temp directory

**Rationale**:
- Single build per test run is efficient
- Temp directory avoids polluting working directory
- `TestMain` is the standard Go pattern for test setup/teardown
- Binary path shared via package-level variable

**Alternatives considered**:
- Build in each test: Rejected - wasteful, slow
- Rely on pre-built binary: Rejected - may be stale, requires external setup
- Use `go run`: Rejected - slower, doesn't test actual binary

### 3. Test Isolation for Config Files

**Decision**: Use `--config` flag with temp directory path for each test

**Rationale**:
- Each test gets isolated config file in `t.TempDir()`
- Avoids modifying user's actual `~/.sandctl/config`
- `--config` flag already supported by sandctl commands
- Clean automatic cleanup via Go's `t.TempDir()`

**Alternatives considered**:
- Mock home directory via `$HOME`: Complex, may affect other tests
- Shared test config: Rejected - tests could interfere with each other

### 4. Session Management in Tests

**Decision**: Unique session names with `e2e-test-` prefix, cleanup via `t.Cleanup`

**Rationale**:
- Prefix allows easy identification and manual cleanup if needed
- Random suffix prevents collisions in parallel test runs
- `t.Cleanup` ensures session destruction even if test fails

**Alternatives considered**:
- Shared sessions across tests: Rejected - violates test isolation
- Manual cleanup only: Rejected - orphaned resources on test failure

### 5. Human-Readable Test Names in Go

**Decision**: Use `t.Run("sandctl start > succeeds with --prompt flag", ...)` subtests

**Rationale**:
- Go's `t.Run` accepts arbitrary string names
- Test output shows the human-readable name
- Can still have a parent `TestSandctl` function grouping related tests
- Names appear in test output: `TestSandctl/sandctl_start_>_succeeds_with_--prompt_flag`

**Alternatives considered**:
- Table-driven tests with struct names: Less readable in output
- Separate `Test*` functions: Harder to share setup

### 6. Commands Requiring Special Handling

| Command | Special Considerations |
|---------|----------------------|
| `init` | Requires isolated config, token via flags or env |
| `start` | Provisions real infrastructure, needs cleanup, ~2 min timeout |
| `list` | May need active session to verify output |
| `exec` | Requires running session, test command output |
| `destroy` | Cleanup command, verify session gone |
| `version` | No API access needed, fastest test |

**Decision**: Test `version` first (no external deps), then full workflow test for others

## Implementation Approach

### Test File Organization

```go
// tests/e2e/cli_test.go
//go:build e2e

package e2e

func TestMain(m *testing.M) {
    // Build sandctl binary to temp location
    // Set package-level binaryPath variable
    // Run tests
    // Cleanup
}

func TestSandctl(t *testing.T) {
    t.Run("sandctl version > displays version information", ...)
    t.Run("sandctl init > creates config file", ...)
    t.Run("sandctl start > succeeds with --prompt flag", ...)
    t.Run("sandctl list > shows active sessions", ...)
    t.Run("sandctl exec > runs command in session", ...)
    t.Run("sandctl destroy > removes session", ...)
    t.Run("workflow > complete session lifecycle", ...)
}
```

### Helper Functions

```go
// tests/e2e/helpers.go
//go:build e2e

package e2e

func runSandctl(t *testing.T, args ...string) (stdout, stderr string, exitCode int)
func runSandctlWithConfig(t *testing.T, configPath string, args ...string) (...)
func buildBinary(t *testing.T) string
func newTempConfig(t *testing.T, token string) string
func generateSessionName(t *testing.T) string
func waitForSession(t *testing.T, configPath, sessionName string, timeout time.Duration)
```

## No Outstanding NEEDS CLARIFICATION

All technical decisions resolved through research.
