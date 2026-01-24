# Quickstart: Simplified Init with Opencode Zen

**Feature**: 006-opencode-default-agent
**Date**: 2026-01-22

## Overview

This guide covers the implementation of simplified sandctl initialization with Opencode Zen authentication.

## Prerequisites

- Go 1.23+
- Access to the sandctl repository
- Sprites API token (for VM provisioning)
- Opencode Zen key (for AI authentication)

## Key Changes

### 1. Configuration Schema

**Before**: Multiple agents, multiple keys
```yaml
sprites_token: "..."
default_agent: "claude"
agent_api_keys:
  claude: "sk-ant-..."
  opencode: "..."
```

**After**: Single key, OpenCode implicit
```yaml
sprites_token: "..."
opencode_zen_key: "..."
```

### 2. Init Command

**Before**:
```bash
sandctl init --sprites-token TOKEN --agent opencode --api-key KEY
```

**After**:
```bash
sandctl init --sprites-token TOKEN --opencode-zen-key KEY
```

### 3. Sandbox Provisioning

OpenCode authentication is now automatic. When a sandbox starts, sandctl:
1. Installs OpenCode (if not present)
2. Creates `~/.local/share/opencode/auth.json` with the Zen key
3. User enters sandbox with OpenCode ready to use

## Implementation Checklist

### Phase 1: Config Schema Changes

- [ ] Update `internal/config/config.go`:
  - Remove `AgentType` type
  - Remove `DefaultAgent` field
  - Remove `AgentAPIKeys` field
  - Add `OpencodeZenKey` field
  - Remove `ValidAgentTypes()` function
  - Update `Validate()` to check `OpencodeZenKey`

- [ ] Update `internal/config/config_test.go`:
  - Update test fixtures for new schema
  - Remove agent-related test cases

### Phase 2: Init Command Changes

- [ ] Update `internal/cli/init.go`:
  - Remove `initAgent` and `initAPIKey` global vars
  - Add `initOpencodeZenKey` global var
  - Remove `--agent` flag
  - Rename `--api-key` to `--opencode-zen-key`
  - Remove `promptAgentSelection()` function
  - Simplify `promptAPIKey()` → `promptOpencodeZenKey()`
  - Update help text

- [ ] Update `internal/cli/init_test.go`:
  - Update all tests for new 2-prompt flow
  - Remove agent selection tests
  - Add tests for Zen key validation

### Phase 3: Session Changes

- [ ] Update `internal/session/types.go`:
  - Remove `Agent` field from `Session` struct

- [ ] Update any references to `Session.Agent` in:
  - `internal/cli/start.go`
  - `internal/cli/list.go` (if displayed)

### Phase 4: Sandbox Provisioning

- [ ] Update `internal/cli/start.go`:
  - Add `setupOpenCodeAuth()` function
  - Create auth directory: `~/.local/share/opencode/`
  - Write auth file with Zen key
  - Handle errors gracefully (warn, don't fail)

### Phase 5: Testing

- [ ] Run existing tests (expect failures)
- [ ] Update tests for new behavior
- [ ] Add new tests for:
  - Zen key required validation
  - Auth file creation in sandbox
  - Migration from old config

## Code Snippets

### New Config Struct

```go
// internal/config/config.go

type Config struct {
    SpritesToken   string `yaml:"sprites_token"`
    OpencodeZenKey string `yaml:"opencode_zen_key"`
}

func (c *Config) Validate() error {
    if c.SpritesToken == "" {
        return errors.New("sprites_token is required")
    }
    if c.OpencodeZenKey == "" {
        return errors.New("opencode_zen_key is required")
    }
    return nil
}
```

### OpenCode Auth Setup

```go
// internal/cli/start.go

func setupOpenCodeAuth(client *sprites.Client, spriteName string, zenKey string) error {
    // Create directory
    mkdirCmd := "mkdir -p ~/.local/share/opencode"
    if _, err := client.ExecCommand(spriteName, mkdirCmd); err != nil {
        return fmt.Errorf("failed to create opencode directory: %w", err)
    }

    // Write auth file
    authJSON := fmt.Sprintf(`{"opencode":{"type":"api","key":"%s"}}`, zenKey)
    writeCmd := fmt.Sprintf("echo '%s' > ~/.local/share/opencode/auth.json", authJSON)
    if _, err := client.ExecCommand(spriteName, writeCmd); err != nil {
        return fmt.Errorf("failed to write opencode auth file: %w", err)
    }

    return nil
}
```

### Simplified Init Prompts

```go
// internal/cli/init.go

func runInitFlow(configPath string, input io.Reader, output io.Writer) error {
    prompter := ui.NewPrompter(input, output)
    existingCfg := loadExistingConfig(configPath)

    fmt.Fprintln(output, "sandctl Configuration")
    fmt.Fprintln(output, "=====================")
    fmt.Fprintln(output)

    // Prompt 1: Sprites token
    spritesToken, err := promptSpritesToken(prompter, existingCfg)
    if err != nil {
        return err
    }

    // Prompt 2: Opencode Zen key
    zenKey, err := promptOpencodeZenKey(prompter, existingCfg)
    if err != nil {
        return err
    }

    // Build and save config
    cfg := &Config{
        SpritesToken:   spritesToken,
        OpencodeZenKey: zenKey,
    }

    if err := config.Save(configPath, cfg); err != nil {
        return fmt.Errorf("failed to save configuration: %w", err)
    }

    fmt.Fprintln(output)
    fmt.Fprintf(output, "Configuration saved to %s\n", configPath)
    return nil
}
```

## Testing Commands

```bash
# Run all tests
go test ./...

# Run init tests specifically
go test ./internal/cli -run TestInit -v

# Run config tests
go test ./internal/config -v

# Lint
golangci-lint run

# Build
go build -o sandctl ./cmd/sandctl
```

## Verification

After implementation, verify:

1. **Init (interactive)**:
   ```bash
   ./sandctl init
   # Should prompt for: Sprites token, Opencode Zen key (only 2 prompts)
   ```

2. **Init (non-interactive)**:
   ```bash
   ./sandctl init --sprites-token TOKEN --opencode-zen-key KEY
   # Should complete without prompts
   ```

3. **Config file**:
   ```bash
   cat ~/.sandctl/config
   # Should show only sprites_token and opencode_zen_key
   ```

4. **Sandbox** (requires real credentials):
   ```bash
   ./sandctl start --prompt "Test"
   # Should create sandbox with OpenCode auth file
   ```
