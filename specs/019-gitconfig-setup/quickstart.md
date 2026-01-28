# Quickstart: Implementing Git Config Setup

**Feature**: 019-gitconfig-setup
**Estimated Effort**: 4-6 hours
**Date**: 2026-01-27

## Overview

Add Git configuration setup to `sandctl init` command, allowing users to transfer their Git identity to VMs for proper commit attribution.

---

## Prerequisites

Before starting implementation:

1. Read [spec.md](./spec.md) - Full feature specification
2. Read [data-model.md](./data-model.md) - Entities and validation rules
3. Read [research.md](./research.md) - Technical patterns and decisions
4. Review [contracts/](./contracts/) - API contracts

**Key Files to Understand**:
- `internal/cli/init.go` - Current init flow (will be extended)
- `internal/ui/prompt.go` - UI components (already available)
- `internal/sshexec/exec.go` - SSH execution (will be extended)

---

## Implementation Checklist

### Phase 1: Core Functions (2-3 hours)

- [ ] **1.1** Add GitConfigMethod enum to `internal/cli/init.go`
- [ ] **1.2** Implement `validateEmail(email string) error`
- [ ] **1.3** Implement `readGitConfig(path string) ([]byte, error)`
- [ ] **1.4** Implement `generateGitConfig(identity GitIdentity) []byte`
- [ ] **1.5** Add unit tests for validation and generation functions

**Test Coverage**:
```bash
go test -run TestValidateEmail internal/cli
go test -run TestGenerateGitConfig internal/cli
```

---

### Phase 2: User Prompts (1-2 hours)

- [ ] **2.1** Implement `selectGitConfigMethod(prompter *ui.Prompter) (GitConfigMethod, error)`
  - Check ~/.gitconfig existence with `os.Stat()`
  - Build options list dynamically
  - Use `prompter.PromptSelect()`

- [ ] **2.2** Implement `promptCustomGitConfigPath(prompter *ui.Prompter) (string, error)`
  - Prompt for path
  - Expand `~` with `os.UserHomeDir()`
  - Validate with `os.Stat()`
  - Loop on errors

- [ ] **2.3** Implement `promptGitIdentity(prompter *ui.Prompter) (GitIdentity, error)`
  - Prompt for name (non-empty validation)
  - Prompt for email (call `validateEmail()`)
  - Loop on validation errors

- [ ] **2.4** Implement `promptGitConfig(prompter *ui.Prompter) (GitConfigMethod, []byte, error)`
  - Call `selectGitConfigMethod()`
  - Switch on method:
    - MethodDefault: Call `readDefaultGitConfig()`
    - MethodCustom: Call `promptCustomGitConfigPath()` + `readGitConfig()`
    - MethodCreateNew: Call `promptGitIdentity()` + `generateGitConfig()`
    - MethodSkip: Return nil content
  - Return method, content, error

- [ ] **2.5** Add unit tests for prompt functions (with mocked io.Reader/Writer)

---

### Phase 3: SSH File Transfer (1 hour)

- [ ] **3.1** Add `TransferFile(content []byte, remotePath, permissions string) error` to `internal/sshexec/client.go`
  - Base64 encode content
  - Execute: `echo '{base64}' | base64 -d > {remotePath} && chmod {permissions} {remotePath}`
  - Return error on failure

- [ ] **3.2** Implement `transferGitConfig(client *sshexec.Client, content []byte, user string) error` in `internal/cli/init.go`
  - Check existence: `test -f ~/.gitconfig && echo 'exists' || echo 'missing'`
  - If exists, return nil (skip per FR-015)
  - Call `client.TransferFile(content, "~/.gitconfig", "0600")`
  - Print status messages

- [ ] **3.3** Add unit tests for TransferFile (requires SSH server mock or integration test)

---

### Phase 4: Integration into init Flow (30 minutes)

- [ ] **4.1** Modify `runInitFlow()` in `internal/cli/init.go`
  - Add call to `promptGitConfig()` after Opencode Zen key prompt
  - Store method and content for later use
  - Handle errors gracefully (non-fatal per FR-021)

- [ ] **4.2** Identify where VM creation happens and add Git config transfer
  - **Option A**: If `sandctl init` creates VM immediately, transfer inline
  - **Option B**: If `sandctl init` only saves config, store Git config method/content in session metadata for `sandctl new` to use
  - **Investigation Required**: Check existing code flow to determine correct approach

- [ ] **4.3** Call `transferGitConfig()` during VM provisioning
  - Pass connected SSH client
  - Pass Git config content
  - Handle transfer errors gracefully (print warning, continue)

---

### Phase 5: E2E Testing (1-2 hours)

- [ ] **5.1** Add E2E test: Default config method
  - Input: Select option 1 (Default)
  - Verify: VM has .gitconfig matching local ~/.gitconfig

- [ ] **5.2** Add E2E test: Create new config method
  - Input: Select Create New, provide name and email
  - Verify: VM has .gitconfig with provided identity

- [ ] **5.3** Add E2E test: Skip method
  - Input: Select Skip
  - Verify: VM has no .gitconfig

- [ ] **5.4** Add E2E test: Existing .gitconfig preservation
  - Setup: Create VM with existing .gitconfig
  - Run: sandctl init with new config
  - Verify: Original .gitconfig preserved (not overwritten)

- [ ] **5.5** Add E2E test: Invalid email retry
  - Input: Provide invalid email first, then valid email
  - Verify: Prompts for retry, accepts valid email

**E2E Test Location**: `tests/e2e/init_gitconfig_test.go`

**E2E Test Pattern** (from research.md and existing tests):
```go
func TestInit_GitConfigDefault(t *testing.T) {
	helper := NewTestHelper(t)
	defer helper.Cleanup()

	// Prepare input: select default option
	input := "1\n" // Select option 1 (Default)

	// Run sandctl init with piped input
	cmd := helper.Command("sandctl", "init", "--hetzner-token", "test-token", "--ssh-agent")
	cmd.Stdin = strings.NewReader(input)
	output, err := cmd.CombinedOutput()

	require.NoError(t, err)
	assert.Contains(t, string(output), "Git configuration set up successfully")
}
```

---

## Code Locations

### Files to Modify
- `internal/cli/init.go` - Add Git config functions and integrate into runInitFlow
- `internal/sshexec/client.go` - Add TransferFile method

### Files to Create
- `tests/e2e/init_gitconfig_test.go` - E2E tests for Git config feature

### Files to Read (No Modification)
- `internal/ui/prompt.go` - Use existing Prompter methods
- `internal/cli/new.go` - Reference for base64 transfer pattern (lines 414-446)

---

## Quick Reference: Key Functions

### Input Validation
```go
// Email validation
if err := validateEmail(email); err != nil {
	fmt.Println(err)
	// Re-prompt
}
```

### File Reading
```go
// Read local .gitconfig
home, _ := os.UserHomeDir()
configPath := filepath.Join(home, ".gitconfig")
content, err := os.ReadFile(configPath)
```

### SSH Transfer
```go
// Transfer file with permissions
encoded := base64.StdEncoding.EncodeToString(content)
cmd := fmt.Sprintf("echo '%s' | base64 -d > ~/.gitconfig && chmod 0600 ~/.gitconfig", encoded)
_, err := sshClient.Exec(cmd)
```

### UI Prompts
```go
// Selection prompt
options := []ui.SelectOption{
	{Value: "default", Label: "Default", Description: "Use your ~/.gitconfig"},
	{Value: "skip", Label: "Skip", Description: "Continue without Git config"},
}
choice, err := prompter.PromptSelect("How to configure Git?", options, 0)

// String prompt
email, err := prompter.PromptString("Enter your email address", "")
```

---

## Testing Strategy

### Unit Tests
- **Target**: All validation and generation functions
- **Coverage**: Happy paths + error cases
- **Location**: `internal/cli/init_test.go`
- **Pattern**: Table-driven tests

### Integration Tests
- **Target**: SSH file transfer (if feasible)
- **Alternative**: Mock sshexec.Client interface
- **Location**: `tests/integration/gitconfig_test.go`

### E2E Tests (Critical per Constitution Principle V)
- **Target**: Full user flow through CLI
- **Coverage**: All 4 methods (Default, Custom, CreateNew, Skip)
- **Location**: `tests/e2e/init_gitconfig_test.go`
- **Pattern**: Black-box CLI invocation, verify behavior via SSH commands

---

## Common Pitfalls

### 1. Shell Escaping in SSH Commands
❌ **Wrong**:
```go
cmd := fmt.Sprintf("echo %s | base64 -d > ~/.gitconfig", encoded) // Missing quotes
```

✅ **Correct**:
```go
cmd := fmt.Sprintf("echo '%s' | base64 -d > ~/.gitconfig", encoded) // Single quotes
```

### 2. Forgetting to Check Existing .gitconfig
❌ **Wrong**: Always transfer config (overwrites existing)

✅ **Correct**:
```go
result, _ := sshClient.Exec("test -f ~/.gitconfig && echo 'exists' || echo 'missing'")
if strings.TrimSpace(result) == "exists" {
	fmt.Println("VM already has Git configuration - preserving existing .gitconfig")
	return nil // Skip transfer per FR-015
}
```

### 3. Fatal Error on Transfer Failure
❌ **Wrong**:
```go
if err := transferGitConfig(client, content, user); err != nil {
	return fmt.Errorf("failed to transfer Git config: %w", err) // Fatal
}
```

✅ **Correct**:
```go
if err := transferGitConfig(client, content, user); err != nil {
	fmt.Printf("✗ Failed to transfer Git config: %v\n", err)
	fmt.Println("Continuing without Git configuration.")
	// Don't return error - continue with init per FR-021
}
```

### 4. Not Trimming Whitespace in Input
❌ **Wrong**: `if email == "" { ... }`

✅ **Correct**: `if strings.TrimSpace(email) == "" { ... }`

---

## Success Criteria Verification

After implementation, verify:

- [ ] **SC-001**: Default config method completes in <30 seconds (time from method selection to success message)
- [ ] **SC-002**: Commits in VM work without additional config (run `git commit` in VM and verify no prompts)
- [ ] **SC-003**: Invalid input feedback appears within 2 seconds (enter invalid email, verify error message appears quickly)
- [ ] **SC-004**: All three methods (default, custom, create new) work without errors (manual testing)
- [ ] **SC-005**: First-attempt success rate high (manual testing with fresh users or dogfooding)

---

## Debugging Tips

### Check if .gitconfig was transferred
```bash
sandctl console <session-id>
$ cat ~/.gitconfig
$ ls -la ~/.gitconfig  # Check permissions (should be -rw-------)
```

### Verify base64 encoding/decoding
```bash
# Local test
echo "test content" | base64
# => dGVzdCBjb250ZW50Cg==

echo 'dGVzdCBjb250ZW50Cg==' | base64 -d
# => test content
```

### SSH command debugging
```go
// Add verbose logging
result, err := sshClient.Exec(cmd)
log.Printf("SSH command: %s", cmd)
log.Printf("SSH result: %s", result)
log.Printf("SSH error: %v", err)
```

---

## Getting Help

- **Architecture Questions**: Review [data-model.md](./data-model.md) and [research.md](./research.md)
- **API Contracts**: Check [contracts/](./contracts/) for function signatures
- **Existing Patterns**: See `internal/cli/new.go:414-446` for file transfer reference
- **UI Components**: See `internal/ui/prompt.go` for available prompt methods
- **Constitution Compliance**: Review `.specify/memory/constitution.md` for quality gates

---

## Next Steps

After completing implementation:

1. Run full test suite: `go test ./...`
2. Run E2E tests: `go test -v ./tests/e2e -run Init`
3. Manual testing:
   - `sandctl init` with each method (Default, Custom, CreateNew, Skip)
   - Verify .gitconfig in VM: `sandctl console <session> && cat ~/.gitconfig`
   - Test commit attribution: `git commit` in VM shows correct name/email
4. Update [CLAUDE.md](../../CLAUDE.md) via agent context update script (Phase 1 final step)
5. Create pull request following git commit guidelines in system message

---

## Estimated Timeline

| Phase | Effort | Depends On |
|-------|--------|------------|
| Phase 1: Core Functions | 2-3 hours | None |
| Phase 2: User Prompts | 1-2 hours | Phase 1 |
| Phase 3: SSH Transfer | 1 hour | Phase 1 |
| Phase 4: Integration | 30 min | Phase 1, 2, 3 |
| Phase 5: E2E Tests | 1-2 hours | Phase 4 |
| **Total** | **5.5-8.5 hours** | |

**Note**: Experienced Go developers familiar with the codebase may complete faster (4-6 hours). New contributors may take longer.

---

## Final Checklist

Before marking feature complete:

- [ ] All code written and passing `go vet` and `golint`
- [ ] Unit tests added and passing
- [ ] E2E tests added and passing
- [ ] Manual testing completed for all scenarios
- [ ] Constitution compliance verified (all quality gates pass)
- [ ] CLAUDE.md updated with new technologies (via agent context script)
- [ ] Code reviewed (if team workflow requires)
- [ ] Documentation updated (if README or other docs reference init flow)
- [ ] Branch ready for PR: `git push origin 019-gitconfig-setup`

**Ready to implement!** Start with Phase 1 and work sequentially through the checklist.
