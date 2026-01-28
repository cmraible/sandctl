# Research: Git Config Setup

**Feature**: 019-gitconfig-setup
**Date**: 2026-01-27
**Status**: Complete

## Overview

This document consolidates research findings for implementing Git configuration setup during `sandctl init`. Research focused on secure file handling, SSH file transfer patterns, email validation, and existing UI components.

---

## 1. Secure File Path Validation in Go

### Decision
Use `os.UserHomeDir()` for home directory expansion and `filepath.Clean()` for path normalization, with explicit existence checks via `os.Stat()`.

### Rationale
- **Existing Pattern**: Codebase already uses `os.UserHomeDir()` extensively (internal/session/store.go:31, internal/config/config.go:72, etc.)
- **Standard Library**: Go's `filepath` package provides cross-platform path manipulation
- **No Third-Party Dependencies**: Maintains project's minimal dependency footprint
- **Permission Handling**: Use `os.Stat()` to check file readability before presenting options (per FR-007: silently disable default option if ~/.gitconfig is unreadable)

### Implementation Pattern
```go
// Expand home directory
home, err := os.UserHomeDir()
if err != nil {
    // Handle error
}
configPath := filepath.Join(home, ".gitconfig")

// Check existence and readability
fileInfo, err := os.Stat(configPath)
if err != nil {
    if os.IsNotExist(err) {
        // File doesn't exist - hide default option
    } else if os.IsPermission(err) {
        // Permission denied - silently hide default option (FR-007)
    }
}
```

### Security Considerations
- **Path Traversal Prevention**: `filepath.Clean()` removes `..` and normalizes paths
- **Permission Validation**: Check `os.IsPermission(err)` to detect unreadable files
- **No Symlink Resolution Needed**: Git config files are typically direct files, not symlinks
- **Cross-Platform**: `filepath` handles Windows vs Unix path separators automatically

### Alternatives Considered
- **filepath.EvalSymlinks**: Rejected - adds complexity without clear benefit for .gitconfig files
- **Third-party validation libraries**: Rejected - unnecessary for this use case, adds dependencies
- **Manual path parsing**: Rejected - error-prone and not cross-platform

---

## 2. SSH File Transfer Patterns

### Decision
Use base64-encoded file transfer via SSH commands, following the existing pattern in `internal/cli/new.go:414-446`.

### Rationale
- **Existing Implementation**: The codebase already uses this pattern for transferring template init scripts (runTemplateInitScript function)
- **No Additional Dependencies**: Uses existing `sshexec.Client.Exec()` method
- **Handles Special Characters**: Base64 encoding safely handles any content including quotes, newlines, and special characters
- **Permission Control**: Can set file permissions (0600) in same operation

### Implementation Pattern
```go
// Based on internal/cli/new.go:423-429
import "encoding/base64"

// Read local .gitconfig
gitconfigContent, err := os.ReadFile(localPath)
if err != nil {
    return err
}

// Base64 encode for safe transfer
encoded := base64.StdEncoding.EncodeToString(gitconfigContent)

// Upload via SSH with correct permissions (0600)
uploadCmd := fmt.Sprintf(
    "echo '%s' | base64 -d > ~/.gitconfig && chmod 0600 ~/.gitconfig",
    encoded,
)
_, err = sshClient.Exec(uploadCmd)
```

### SSH Client Interface
The `sshexec.Client` (internal/sshexec/exec.go) provides:
- `Exec(command string) (string, error)` - Basic command execution with output
- `ExecWithResult(command string) (*ExecResult, error)` - Detailed results with exit code
- `ExecWithStreams(command string, stdin, stdout, stderr io.Writer) error` - Custom I/O

### Error Handling
```go
// Check if .gitconfig already exists on VM (FR-015)
checkCmd := "test -f ~/.gitconfig && echo 'exists' || echo 'missing'"
result, err := sshClient.Exec(checkCmd)
if strings.TrimSpace(result) == "exists" {
    // Skip transfer - preserve existing config (FR-015)
    return nil
}
```

### Alternatives Considered
- **SCP Protocol**: Rejected - would require additional SSH session handling and complexity
- **SFTP**: Rejected - would need golang.org/x/crypto/ssh/sftp dependency
- **Multi-line heredoc**: Rejected - difficult to escape properly, base64 is safer

---

## 3. Email Validation in Go

### Decision
Use simple string-based validation checking for `@` symbol and basic format, consistent with FR-013 requirement for "basic valid format (contains @ and domain)".

### Rationale
- **Specification Alignment**: FR-013 explicitly states only basic format validation needed
- **No Verification Required**: Feature spec assumption #6 confirms we don't verify email actually exists
- **Minimal Complexity**: Avoids heavyweight regex or parsing libraries
- **Good Error Messages**: Simple check allows clear error feedback within 2 seconds (SC-003)

### Implementation Pattern
```go
func validateEmail(email string) error {
    email = strings.TrimSpace(email)

    if email == "" {
        return fmt.Errorf("email cannot be empty")
    }

    // Basic format: must contain @ and have text before and after
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

### Example Valid/Invalid
- ✅ Valid: `user@example.com`, `name.surname@company.co.uk`, `dev+test@localhost.localdomain`
- ❌ Invalid: `@example.com`, `user@`, `user@domain`, `user@@example.com`, `userexample.com`

### Alternatives Considered
- **net/mail.ParseAddress**: Considered but overkill - validates RFC 5322 which is more complex than needed
- **Regex validation**: Rejected - regex for email is complex and error-prone, simple string operations are clearer
- **Third-party libraries**: Rejected - unnecessary dependency for basic validation

---

## 4. Existing UI Prompt Components

### Decision
Use `ui.Prompter.PromptSelect()` for configuration method selection and `ui.Prompter.PromptString()` for text inputs.

### Rationale
- **Existing Infrastructure**: The `internal/ui/prompt.go` package provides exactly the needed functionality
- **Consistent UX**: Matches existing patterns in `sandctl init` command (internal/cli/init.go)
- **Terminal Detection**: Built-in `ui.IsTerminal()` handles non-interactive scenarios
- **Testable**: Prompter accepts io.Reader/Writer for test injection

### Available Components

#### PromptSelect (lines 139-176)
```go
type SelectOption struct {
    Value       string
    Label       string
    Description string
}

func (p *Prompter) PromptSelect(
    prompt string,
    options []SelectOption,
    defaultIndex int,
) (int, error)
```

**Use for**: Presenting 3 Git config methods (default/custom/create new)

#### PromptString (lines 41-64)
```go
func (p *Prompter) PromptString(
    prompt string,
    defaultValue string,
) (string, error)
```

**Use for**:
- File path input (custom config option)
- Name input (create new option)
- Email input (create new option)

#### PromptYesNo (lines 189-219)
```go
func (p *Prompter) PromptYesNo(
    prompt string,
    defaultYes bool,
) (bool, error)
```

**Use for**: Optional - confirm skip if user wants to bypass Git config setup

### Implementation Strategy

```go
// Build options dynamically based on ~/.gitconfig availability
var options []ui.SelectOption
hasDefaultConfig := false

// Check if ~/.gitconfig exists and is readable
if home, err := os.UserHomeDir(); err == nil {
    gitconfigPath := filepath.Join(home, ".gitconfig")
    if _, err := os.Stat(gitconfigPath); err == nil {
        // Default option available (FR-003, FR-004)
        options = append(options, ui.SelectOption{
            Value:       "default",
            Label:       "Default",
            Description: "Use your ~/.gitconfig (recommended)",
        })
        hasDefaultConfig = true
    }
}

// Always present custom and create options (FR-003)
options = append(options, ui.SelectOption{
    Value:       "custom",
    Label:       "Custom",
    Description: "Specify path to different config file",
})
options = append(options, ui.SelectOption{
    Value:       "create",
    Label:       "Create New",
    Description: "Enter name and email to generate config",
})
options = append(options, ui.SelectOption{
    Value:       "skip",
    Label:       "Skip",
    Description: "Continue without Git configuration",
})

// Default index: 0 if default available, else skip (last option)
defaultIndex := 0
if !hasDefaultConfig {
    defaultIndex = len(options) - 1 // Skip option
}

prompter := ui.DefaultPrompter()
choice, err := prompter.PromptSelect(
    "How would you like to configure Git in the VM?",
    options,
    defaultIndex,
)
```

### Testing Considerations
- UI components support test injection via `ui.NewPrompter(reader, writer)`
- Existing tests in `internal/ui/prompt_test.go` demonstrate patterns
- E2E tests should use actual CLI invocation (Principle V)

### Alternatives Considered
- **Custom prompt implementation**: Rejected - reinventing the wheel, existing components are well-tested
- **Third-party TUI libraries** (bubbletea, survey): Rejected - adds significant dependencies, existing components sufficient
- **Simple fmt.Scan**: Rejected - poor UX, no default value support, inconsistent with rest of sandctl

---

## Summary

All research objectives have been completed:

| Research Area | Solution | Source |
|--------------|----------|--------|
| File path validation | os.UserHomeDir() + filepath.Clean() + os.Stat() | Standard library patterns in codebase |
| SSH file transfer | Base64-encoded command execution via sshexec.Client.Exec() | internal/cli/new.go:414-446 |
| Email validation | Simple string split checking for @ and domain | Custom implementation per FR-013 |
| UI components | ui.Prompter with PromptSelect and PromptString | internal/ui/prompt.go |

All solutions align with:
- Constitution Principle I (Code Quality): Simple, readable, no escape hatches
- Constitution Principle II (Performance): Fast operations, <2s feedback (SC-003)
- Constitution Principle III (Security): Input validation, permission checks, safe file operations
- Constitution Principle IV (User Privacy): User-controlled data only

No blockers or unresolved issues remaining for implementation.
