# Quickstart: Rename Start Command to New

**Feature**: 010-rename-start-to-new
**Date**: 2026-01-25

## Implementation Overview

This feature involves renaming the `start` command to `new` and removing the prompt functionality. The implementation touches these areas:

1. CLI command (rename and simplify)
2. Session data model (remove Prompt field)
3. Tests (update to use new command name)

## Files to Modify

### 1. Rename Command File

```bash
git mv internal/cli/start.go internal/cli/new.go
```

### 2. Update internal/cli/new.go

- Change command `Use` from `"start"` to `"new"`
- Remove `--prompt` flag and related validation
- Remove `startAgentInSprite` provisioning step
- Update command descriptions and examples
- Remove prompt-related variables

### 3. Update internal/session/types.go

- Remove `Prompt` field from `Session` struct
- Update `Validate()` method to remove prompt validation

### 4. Update internal/session/types_test.go

- Update tests to not require Prompt field
- Remove prompt validation tests

### 5. Update tests/e2e/cli_test.go

- Rename `testStartSucceeds` → test uses `new` command
- Rename `testStartFailsWithoutConfig` → test uses `new` command
- Remove `testStartRequiresPrompt` (no longer applicable)
- Add test that `start` command returns unknown command error
- Update workflow test to use `new` instead of `start`

### 6. Update tests/e2e/helpers.go

- If any helpers reference the start command, update to new

## Key Code Changes

### new.go: Command Definition

```go
var newCmd = &cobra.Command{
    Use:   "new",
    Short: "Create a new sandboxed agent session",
    Long: `Create a new sandboxed VM with development tools and OpenCode installed.

The system provisions a Fly.io Sprite, installs development tools, and sets up
OpenCode with your configured Zen key. Connect to the session using 'sandctl exec'.`,
    Example: `  # Create a new session
  sandctl new

  # Create with auto-destroy timeout
  sandctl new --timeout 2h`,
    RunE: runNew,
}
```

### new.go: Simplified Provisioning Steps

```go
steps := []ui.ProgressStep{
    {
        Message: "Provisioning VM",
        Action: func() error {
            return provisionSprite(client, sessionID)
        },
    },
    {
        Message: "Installing development tools",
        Action: func() error {
            return installDevTools(client, sessionID)
        },
    },
    {
        Message: "Installing OpenCode",
        Action: func() error {
            return installOpenCode(client, sessionID)
        },
    },
    {
        Message: "Setting up OpenCode authentication",
        Action: func() error {
            return setupOpenCodeAuth(client, sessionID, cfg.OpencodeZenKey)
        },
    },
    // NOTE: "Starting agent" step REMOVED
}
```

### types.go: Session Struct

```go
type Session struct {
    ID        string    `json:"id"`
    Status    Status    `json:"status"`
    CreatedAt time.Time `json:"created_at"`
    Timeout   *Duration `json:"timeout,omitempty"`
}
```

## Verification Steps

1. `make lint` - Passes
2. `make test` - Unit tests pass
3. `make test-e2e` - E2E tests pass (with API tokens)
4. `sandctl new` - Creates session without prompt
5. `sandctl start` - Returns "unknown command: start"
6. `sandctl new --timeout 1h` - Creates session with timeout
