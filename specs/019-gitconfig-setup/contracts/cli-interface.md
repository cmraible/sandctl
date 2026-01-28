# CLI Interface Contract: Git Config Setup

**Feature**: 019-gitconfig-setup
**Command**: `sandctl init` (extended functionality)
**Date**: 2026-01-27

## Overview

This contract documents the user-facing behavior of the Git configuration setup feature within the `sandctl init` command.

---

## Command Interface

### Command
```bash
sandctl init [flags]
```

### Extended Behavior

Git configuration setup is integrated into the existing `sandctl init` interactive flow. The feature adds a new step after cloud provider configuration but before VM provisioning.

**Integration Point**: Between Hetzner token configuration and VM creation

**Flow Position**:
```
sandctl init
  ├─→ Load existing config (if present)
  ├─→ Prompt for Hetzner token
  ├─→ Prompt for SSH key
  ├─→ Prompt for region/server type
  ├─→ [NEW] Prompt for Git configuration  ← This feature
  ├─→ Prompt for Opencode Zen key
  └─→ Save configuration
```

---

## Interactive Prompts

### 1. Configuration Method Selection

**Prompt**:
```
How would you like to configure Git in the VM?

  1. Default     - Use your ~/.gitconfig (recommended)
  2. Custom      - Specify path to different config file
  3. Create New  - Enter name and email to generate config
  4. Skip        - Continue without Git configuration

Enter choice [1-4] (default: 1):
```

**Note**: Option 1 (Default) is only shown if `~/.gitconfig` exists and is readable. If unavailable, option 1 becomes "Custom" and default choice adjusts accordingly.

**Validation**:
- Must be numeric input between 1 and number of available options
- Invalid input shows: `invalid choice: {input} (must be 1-4)`
- Allows retry on validation failure

**Exit Codes**:
- Valid selection: Continue to next step
- EOF/Ctrl+D: Returns default selection (Skip if no ~/.gitconfig, Default if available)
- Ctrl+C: Aborts entire `sandctl init` command (standard behavior)

---

### 2. Custom Path Input (if Custom selected)

**Prompt**:
```
Enter path to Git config file:
```

**Validation**:
- Path must point to existing, readable file
- Supports shell expansion (`~` → home directory)
- Supports relative paths (converted to absolute)

**Error Messages**:
- File not found: `File not found: {path}. Please check the path and try again.`
- Permission denied: `Cannot read file: {path} (permission denied). Please check file permissions.`
- Directory provided: `{path} is a directory. Please provide a path to a file.`

**Retry Behavior**:
- On error, display message and re-prompt for path
- User can enter empty input to cancel and return to method selection

---

### 3. Name Input (if Create New selected)

**Prompt**:
```
Enter your full name:
```

**Validation**:
- Must not be empty after trimming whitespace
- No other format restrictions

**Error Messages**:
- Empty input: `Name cannot be empty. Please enter your full name.`

**Retry Behavior**:
- On error, display message and re-prompt
- No escape/cancel option (user must provide name or Ctrl+C to abort)

---

### 4. Email Input (if Create New selected)

**Prompt**:
```
Enter your email address:
```

**Validation**:
- Must contain exactly one `@` symbol
- Must have non-empty text before `@`
- Must have domain with `.` after `@`

**Error Messages**:
- Invalid format: `Invalid email format: must contain @ and domain (e.g., user@example.com)`
- Empty input: `Email cannot be empty. Please enter your email address.`
- No @ symbol: `Invalid email format: must contain @ and domain (e.g., user@example.com)`
- No domain: `Invalid email format: must contain @ and domain (e.g., user@example.com)`

**Retry Behavior**:
- On error, display message and re-prompt within 2 seconds (SC-003)
- No escape/cancel option (user must provide email or Ctrl+C to abort)

---

## Transfer Phase (During VM Creation)

### Status Messages

**When VM already has .gitconfig**:
```
VM already has Git configuration - preserving existing .gitconfig
```

**When transferring config (Default/Custom methods)**:
```
Transferring Git configuration to VM...
```

**When creating new config**:
```
Creating Git configuration in VM...
```

**On successful transfer**:
```
✓ Git configuration set up successfully
```

**On transfer failure**:
```
✗ Failed to transfer Git config: {error}
Continuing without Git configuration.
```

### Error Handling

Transfer errors are **non-fatal** (FR-021). If Git config transfer fails, `sandctl init` continues with a warning message. The VM is still created and usable, just without Git configuration.

**User Impact**:
- Can still make commits, but Git will prompt for name/email on first commit
- User can manually configure Git in the VM after creation

---

## Non-Interactive Mode

Git configuration setup is **skipped** in non-interactive mode (when using flags like `--hetzner-token`, `--ssh-agent`, etc.).

**Rationale**: Non-interactive mode is for automation/CI where prompts are not possible. Users can configure Git manually in the VM after provisioning.

**Future Enhancement**: Could add flags like `--git-config-path` or `--git-name`/`--git-email` for non-interactive Git setup.

---

## Exit Codes

Git configuration setup does not introduce new exit codes. It follows the existing `sandctl init` exit code behavior:

- `0` - Success (config saved, or skipped Git config)
- `1` - Error (invalid flags, config validation failed, etc.)

Git config transfer failure does **not** cause non-zero exit code (errors are non-fatal per FR-021).

---

## Examples

### Happy Path: Default Config

```bash
$ sandctl init
# ... existing prompts ...

How would you like to configure Git in the VM?

  1. Default     - Use your ~/.gitconfig (recommended)
  2. Custom      - Specify path to different config file
  3. Create New  - Enter name and email to generate config
  4. Skip        - Continue without Git configuration

Enter choice [1-4] (default: 1): 1

# Later during VM creation...
Transferring Git configuration to VM...
✓ Git configuration set up successfully

# ... rest of init continues ...
```

### Custom Config Path

```bash
$ sandctl init
# ... existing prompts ...

How would you like to configure Git in the VM?

  1. Default     - Use your ~/.gitconfig (recommended)
  2. Custom      - Specify path to different config file
  3. Create New  - Enter name and email to generate config
  4. Skip        - Continue without Git configuration

Enter choice [1-4] (default: 1): 2

Enter path to Git config file: ~/projects/work/.gitconfig

Transferring Git configuration to VM...
✓ Git configuration set up successfully
```

### Create New Config

```bash
$ sandctl init
# ... existing prompts ...

How would you like to configure Git in the VM?

  1. Default     - Use your ~/.gitconfig (recommended)
  2. Custom      - Specify path to different config file
  3. Create New  - Enter name and email to generate config
  4. Skip        - Continue without Git configuration

Enter choice [1-4] (default: 1): 3

Enter your full name: Jane Developer

Enter your email address: jane@example.com

Creating Git configuration in VM...
✓ Git configuration set up successfully
```

### No Default Available (Missing ~/.gitconfig)

```bash
$ sandctl init
# ... existing prompts ...

How would you like to configure Git in the VM?

  1. Custom      - Specify path to different config file
  2. Create New  - Enter name and email to generate config
  3. Skip        - Continue without Git configuration

Enter choice [1-3] (default: 3): 3

Skipping Git configuration.

# ... rest of init continues ...
```

### Error: Invalid Email

```bash
Enter your email address: jane.example.com

Invalid email format: must contain @ and domain (e.g., user@example.com)

Enter your email address: jane@

Invalid email format: must contain @ and domain (e.g., user@example.com)

Enter your email address: jane@example.com

Creating Git configuration in VM...
✓ Git configuration set up successfully
```

---

## Performance Guarantees

From success criteria:

- **SC-001**: Users can complete Git config setup in under 30 seconds for default option
  - Measured from method selection to "✓ Git configuration set up successfully"
  - Includes file reading, SSH transfer, and permission setting

- **SC-003**: Users receive feedback within 2 seconds when providing invalid inputs
  - Applies to: invalid email format, invalid file path, invalid choice selection

---

## Accessibility

- All prompts are text-based (no graphics/colors required)
- Works in non-terminal environments (for testing)
- Supports stdin/stdout redirection for automated testing
- No keyboard shortcuts required (numeric selection)
- Clear error messages with recovery options

---

## Backwards Compatibility

This feature is additive only:
- Existing `sandctl init` behavior is preserved
- No breaking changes to flags or outputs
- Users who skip Git config get identical behavior to pre-feature version
- Existing configurations continue to work unchanged

---

## Future Enhancements

**Out of scope for this iteration**:
- Non-interactive flags (`--git-config`, `--git-name`, `--git-email`)
- Syncing Git config changes back from VM to local machine
- Updating Git config after VM creation (would need separate command like `sandctl config git`)
- Supporting multiple Git identities per VM
- Integration with Git credential helpers
