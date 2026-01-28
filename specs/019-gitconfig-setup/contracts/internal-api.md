# Internal API Contract: Git Config Setup

**Feature**: 019-gitconfig-setup
**Package**: `internal/cli` (primary), `internal/sshexec` (extended)
**Date**: 2026-01-27

## Overview

This contract defines the internal function signatures and interfaces for Git configuration setup functionality.

---

## Package: internal/cli (init.go)

### Main Orchestration Function

```go
// promptGitConfig prompts the user to configure Git in the VM and returns
// the selected method and any necessary data for transfer.
// This function is called during the runInitFlow sequence.
//
// Returns:
//   - method: the selected GitConfigMethod
//   - content: the .gitconfig file content to transfer (empty if Skip selected)
//   - error: any error during prompting or file reading
func promptGitConfig(prompter *ui.Prompter) (method GitConfigMethod, content []byte, error)
```

**Integration Point**: Called in `runInitFlow()` after Opencode Zen key prompt, before saving config.

**Error Handling**:
- Returns error only for unrecoverable failures (I/O errors, terminal issues)
- Validation errors are handled internally with retry prompts
- User selecting "Skip" returns `(MethodSkip, nil, nil)` (not an error)

---

### Enumeration: GitConfigMethod

```go
// GitConfigMethod represents the user's chosen method for Git configuration.
type GitConfigMethod int

const (
	MethodDefault GitConfigMethod = iota // Use ~/.gitconfig
	MethodCustom                          // Use custom path
	MethodCreateNew                       // Generate from name/email
	MethodSkip                            // Skip Git config
)
```

---

### Configuration Selection Function

```go
// selectGitConfigMethod prompts the user to choose how to configure Git.
// The available options depend on whether ~/.gitconfig exists and is readable.
//
// Returns the selected method and error if prompting fails.
func selectGitConfigMethod(prompter *ui.Prompter) (GitConfigMethod, error)
```

**Behavior**:
- Checks `~/.gitconfig` existence with `os.Stat()`
- Silently excludes "Default" option if file missing or unreadable (FR-007)
- Returns index from `prompter.PromptSelect()` mapped to GitConfigMethod
- Default selection: MethodDefault if available, else MethodSkip

---

### File Reading Functions

```go
// readGitConfig reads a .gitconfig file from the specified path.
// The path is expanded (~ → home directory) and validated.
//
// Returns:
//   - content: the file content as bytes
//   - error: if file doesn't exist, is unreadable, or other I/O error
func readGitConfig(path string) (content []byte, error)

// readDefaultGitConfig is a convenience wrapper for readGitConfig
// that uses the default ~/.gitconfig path.
func readDefaultGitConfig() (content []byte, error)
```

**Behavior**:
- Uses `os.UserHomeDir()` for `~` expansion
- Uses `filepath.Clean()` for path normalization
- Uses `os.ReadFile()` for content reading
- Returns `os.IsNotExist(err)` or `os.IsPermission(err)` errors as-is for caller to handle

---

### Custom Path Input Function

```go
// promptCustomGitConfigPath prompts the user for a path to a .gitconfig file
// and validates that it exists and is readable.
//
// Returns the absolute path to the file and any error.
// On validation failure, re-prompts the user until valid path or empty input (cancel).
func promptCustomGitConfigPath(prompter *ui.Prompter) (path string, error)
```

**Behavior**:
- Calls `prompter.PromptString("Enter path to Git config file", "")`
- Expands `~` to home directory using `os.UserHomeDir()`
- Converts relative paths to absolute with `filepath.Abs()`
- Validates with `os.Stat()` and checks `IsNotExist`, `IsPermission`, `IsDir` errors
- Loops until valid path or empty input (empty = cancel back to method selection)

---

### New Config Creation Functions

```go
// promptGitIdentity prompts the user for name and email to create a Git config.
// Validates email format per FR-013.
//
// Returns a GitIdentity struct with validated name and email.
func promptGitIdentity(prompter *ui.Prompter) (GitIdentity, error)

// GitIdentity holds user identity information for Git configuration.
type GitIdentity struct {
	Name  string
	Email string
}

// generateGitConfig creates a .gitconfig file content from a GitIdentity.
// The generated config contains [user] section with name and email.
func generateGitConfig(identity GitIdentity) []byte
```

**Behavior** (promptGitIdentity):
- Prompts for name with `prompter.PromptString("Enter your full name", "")`
- Validates name is non-empty after `strings.TrimSpace()`
- Prompts for email with `prompter.PromptString("Enter your email address", "")`
- Validates email with `validateEmail()` function
- Retries on validation failures with clear error messages

**Behavior** (generateGitConfig):
- Formats as standard Git config INI format:
  ```ini
  [user]
  	name = {identity.Name}
  	email = {identity.Email}
  ```
- Returns as `[]byte` ready for transfer

---

### Email Validation Function

```go
// validateEmail checks if an email has basic valid format per FR-013.
// Returns nil if valid, error with descriptive message if invalid.
//
// Valid format: non-empty username @ domain with at least one dot
// Examples: user@example.com, dev+test@company.co.uk
func validateEmail(email string) error
```

**Algorithm**:
```go
func validateEmail(email string) error {
	email = strings.TrimSpace(email)
	if email == "" {
		return fmt.Errorf("email cannot be empty")
	}

	parts := strings.Split(email, "@")
	if len(parts) != 2 {
		return fmt.Errorf("email must contain exactly one @")
	}

	if len(parts[0]) == 0 {
		return fmt.Errorf("email must have username before @")
	}

	if len(parts[1]) == 0 || !strings.Contains(parts[1], ".") {
		return fmt.Errorf("email must have domain with . after @")
	}

	return nil
}
```

---

### Transfer Orchestration Function

```go
// transferGitConfig uploads .gitconfig content to the VM via SSH.
// Checks if VM already has .gitconfig and skips if present (FR-015).
// Sets permissions to 0600 on transferred file (FR-018).
//
// Parameters:
//   - client: connected sshexec.Client for the target VM
//   - content: .gitconfig file content to transfer
//   - user: target user in VM (typically "agent")
//
// Returns error if transfer fails. Prints status messages to stdout.
func transferGitConfig(client *sshexec.Client, content []byte, user string) error
```

**Behavior**:
1. Check if `~/.gitconfig` exists in VM with `test -f ~/.gitconfig`
2. If exists, print message and return nil (skip transfer per FR-015)
3. If missing, transfer content via base64-encoded SSH command
4. Set permissions to 0600 with `chmod 0600 ~/.gitconfig`
5. Print success message on completion
6. Return error if any step fails (SSH command execution errors)

**Status Messages**:
- Existing config: "VM already has Git configuration - preserving existing .gitconfig"
- Transferring: "Transferring Git configuration to VM..." or "Creating Git configuration in VM..."
- Success: "✓ Git configuration set up successfully"
- Failure: "✗ Failed to transfer Git config: {error}\nContinuing without Git configuration."

---

## Package: internal/sshexec (client.go - new function)

### File Transfer Function

```go
// TransferFile uploads file content to the remote host via base64 encoding.
// This is a general-purpose file transfer utility.
//
// Parameters:
//   - content: file content as bytes
//   - remotePath: target path on remote host
//   - permissions: file permissions (e.g., "0600" for user read/write only)
//
// Returns error if transfer fails.
//
// Implementation uses base64 encoding to safely handle any file content:
//   echo '{base64}' | base64 -d > {remotePath} && chmod {permissions} {remotePath}
func (c *Client) TransferFile(content []byte, remotePath string, permissions string) error
```

**Example Usage**:
```go
// Transfer .gitconfig with 0600 permissions
err := sshClient.TransferFile(gitconfigContent, "~/.gitconfig", "0600")
```

**Error Handling**:
- Returns SSH execution errors directly
- Caller responsible for interpreting errors and user messaging

**Security**:
- Base64 encoding prevents shell injection from file content
- Single-quote around base64 string prevents variable expansion
- Permissions are set in same command to avoid race conditions

---

## Package Integration: internal/cli/init.go

### Modified runInitFlow Function

The existing `runInitFlow` function will be extended to call Git config setup:

```go
func runInitFlow(configPath string, stdin io.Reader, stdout io.Writer) error {
	// ... existing code for Hetzner token, SSH key, region, server type ...

	// Prompt for Opencode Zen key (existing)
	opencodeZenKey, err := prompter.PromptString(...)
	// ... existing code ...

	// NEW: Prompt for Git configuration
	gitMethod, gitContent, err := promptGitConfig(prompter)
	if err != nil {
		return fmt.Errorf("failed to configure Git: %w", err)
	}

	// Save config (existing)
	// ...

	// NEW: If Git config should be transferred, store method and content
	// for use during VM creation in runNew command
	// (Implementation detail: may store in session metadata or pass directly if
	// init flow creates VM immediately)
}
```

**Note**: The exact integration point depends on whether `sandctl init` creates a VM immediately or only saves configuration. This needs clarification from existing codebase behavior.

---

## Testing Interface

All functions accept `*ui.Prompter` which supports test injection:

```go
// Test example
func TestPromptGitConfig_DefaultMethod(t *testing.T) {
	// Create test prompter with simulated input
	input := strings.NewReader("1\n") // Select option 1 (Default)
	output := &bytes.Buffer{}
	prompter := ui.NewPrompter(input, output)

	method, content, err := promptGitConfig(prompter)

	assert.NoError(t, err)
	assert.Equal(t, MethodDefault, method)
	assert.NotEmpty(t, content) // Should contain ~/.gitconfig content
}
```

---

## Error Types

Define custom error types for specific error handling:

```go
// GitConfigError represents errors during Git configuration setup.
type GitConfigError struct {
	Operation string // e.g., "read file", "validate email", "transfer"
	Err       error
}

func (e *GitConfigError) Error() string {
	return fmt.Sprintf("Git config %s: %v", e.Operation, e.Err)
}

func (e *GitConfigError) Unwrap() error {
	return e.Err
}
```

**Usage**:
- Wrap errors with context for better debugging
- Allows error checking with `errors.Is()` and `errors.As()`

---

## Dependencies

### Existing Packages (No Changes)
- `internal/ui` - Use existing Prompter interface
- `internal/config` - No changes (Git config not persisted in sandctl config)
- `internal/session` - May need minor extension to pass Git config during VM creation

### Standard Library
- `os` - File operations, UserHomeDir()
- `path/filepath` - Path manipulation
- `strings` - String validation
- `fmt` - Error formatting
- `encoding/base64` - File transfer encoding

### Extended Packages (New Functions)
- `internal/sshexec` - Add TransferFile() method to Client

---

## Performance Contracts

From success criteria and research:

| Operation | Target | Measurement Point |
|-----------|--------|-------------------|
| Default config selection to transfer complete | <30s | SC-001 |
| Invalid input feedback | <2s | SC-003 |
| File path validation (os.Stat) | <10ms | Research finding |
| Email validation | <1ms | Research finding |
| SSH transfer (10KB config) | <100ms | Research finding |

All functions should complete within these bounds under normal conditions.

---

## Thread Safety

Not applicable - `sandctl init` runs in single-threaded interactive mode.

---

## Assumptions

1. SSH client is already connected when `transferGitConfig()` is called
2. VM is fully booted and SSH is accessible
3. Agent user home directory exists in VM
4. `base64` command is available in VM (standard on all Linux)
5. File permissions can be set with `chmod` (standard on all Linux)

---

## Future Extensions

**Potential additions for future iterations**:

```go
// SyncGitConfig syncs .gitconfig from VM back to local machine
func SyncGitConfig(client *sshexec.Client, localPath string) error

// UpdateGitConfig updates existing .gitconfig in running VM
func UpdateGitConfig(sessionID string, method GitConfigMethod) error

// GetGitConfig retrieves current .gitconfig from VM
func GetGitConfig(client *sshexec.Client) (content []byte, error)
```

These are **out of scope** for 019-gitconfig-setup but documented here for completeness.
