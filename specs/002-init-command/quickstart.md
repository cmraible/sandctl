# Quickstart: Init Command Implementation

**Feature**: 002-init-command
**Date**: 2026-01-22

## Prerequisites

- Go 1.22+ installed
- Repository cloned and on branch `002-init-command`
- Existing dependencies installed (`go mod download`)

## Implementation Sequence

### Step 1: Add Config Writer (internal/config/writer.go)

Create a new file to handle atomic config file writing:

```go
package config

import (
    "os"
    "path/filepath"

    "gopkg.in/yaml.v3"
)

// Save writes the configuration to the specified path atomically.
func Save(path string, cfg *Config) error {
    // 1. Create directory with 0700
    // 2. Create temp file in same directory
    // 3. Set temp file permissions to 0600
    // 4. Write YAML
    // 5. Atomic rename
}
```

### Step 2: Add UI Prompts (internal/ui/prompt.go)

Create a new file for interactive input:

```go
package ui

import (
    "golang.org/x/term"
)

// PromptString prompts for text input with optional default.
func PromptString(prompt, defaultValue string) (string, error)

// PromptSecret prompts for hidden input (no echo).
func PromptSecret(prompt string) (string, error)

// PromptSelect prompts for numbered selection.
func PromptSelect(prompt string, options []string, defaultIndex int) (int, error)
```

### Step 3: Add Init Command (internal/cli/init.go)

Create the init command following existing command patterns:

```go
package cli

import "github.com/spf13/cobra"

var initCmd = &cobra.Command{
    Use:   "init",
    Short: "Configure sandctl",
    RunE:  runInit,
}

func init() {
    // Register flags: --sprites-token, --agent, --api-key
    rootCmd.AddCommand(initCmd)
}

func runInit(cmd *cobra.Command, args []string) error {
    // 1. Check for existing config
    // 2. Prompt for values (or use flags)
    // 3. Validate inputs
    // 4. Save config
    // 5. Print success message
}
```

### Step 4: Write Tests

Following the existing BDD naming pattern:

```go
// internal/config/writer_test.go
func TestSave_GivenValidConfig_ThenCreatesFileWithCorrectPermissions(t *testing.T)
func TestSave_GivenExistingConfig_ThenUpdatesAtomically(t *testing.T)

// internal/ui/prompt_test.go
func TestPromptString_GivenInput_ThenReturnsValue(t *testing.T)
func TestPromptSecret_GivenInput_ThenReturnsValueWithoutEcho(t *testing.T)

// internal/cli/init_test.go
func TestRunInit_GivenNoConfig_ThenPromptsAndCreatesConfig(t *testing.T)
func TestRunInit_GivenFlags_ThenSkipsPrompts(t *testing.T)
```

## Verification Commands

```bash
# Run all tests
go test ./...

# Run with race detection
go test -race ./...

# Run with coverage
go test -cover ./...

# Build and test init command
go build ./cmd/sandctl
./sandctl init --help
```

## Expected Output

After implementation, `sandctl init` should produce:

```text
$ sandctl init

Welcome to sandctl setup!

Sprites Token (get one at https://sprites.dev/tokens):
[hidden input]

Select default AI agent:
  1. claude   - Anthropic Claude (recommended)
  2. opencode - OpenCode agent
  3. codex    - OpenAI Codex
Enter choice [1-3] (default: 1): 1

Claude API Key (get one at https://console.anthropic.com/):
[hidden input]

✓ Configuration saved to ~/.sandctl/config

You're ready to go! Try:
  sandctl start --prompt "Create a simple web server"
```

## Files to Create

| File | Purpose |
|------|---------|
| `internal/config/writer.go` | Atomic config file writing |
| `internal/config/writer_test.go` | Writer tests |
| `internal/ui/prompt.go` | Interactive prompt helpers |
| `internal/ui/prompt_test.go` | Prompt tests |
| `internal/cli/init.go` | Init command implementation |
| `internal/cli/init_test.go` | Init command tests |

## Files to Modify

| File | Change |
|------|--------|
| `internal/cli/root.go` | Long description updated to include init command |
