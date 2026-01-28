# Data Model: Git Config Setup

**Feature**: 019-gitconfig-setup
**Date**: 2026-01-27

## Overview

This feature extends the `sandctl init` command to handle Git configuration setup. The data model focuses on configuration method selection, file path validation, and user input capture for Git identity creation.

---

## Entities

### 1. GitConfigMethod (Enumeration)

Represents the user's chosen method for configuring Git in the VM.

**Values**:
- `Default` - Use the user's existing ~/.gitconfig file
- `Custom` - Use a config file from a custom path specified by the user
- `CreateNew` - Generate a new .gitconfig from user-provided name and email
- `Skip` - Skip Git configuration entirely

**Validation Rules**:
- `Default` method is only available if ~/.gitconfig exists and is readable (FR-003, FR-007)
- All methods are mutually exclusive
- Selection must be from available options only

**State Transitions**:
```
Initial → [User Selects Method] → Selected
Selected → [Validation Passes] → Validated
Selected → [Validation Fails] → Error (prompt retry per FR-020)
Validated → [Transfer Complete] → Complete
```

---

### 2. GitConfigFile

Represents a Git configuration file with its path and content.

**Fields**:
| Field | Type | Required | Validation | Notes |
|-------|------|----------|------------|-------|
| Path | string | Yes | Must exist and be readable | Absolute path to .gitconfig file |
| Content | []byte | Yes | Must be valid file content | Raw file content to transfer |
| IsReadable | bool | Derived | - | Result of os.Stat() permission check |
| Size | int64 | Derived | - | File size in bytes |

**Validation Rules**:
- Path must be absolute (use filepath.Abs to convert relative paths) (FR-010)
- Path must exist (os.Stat returns no IsNotExist error)
- File must be readable (os.Stat returns no IsPermission error)
- File size should be reasonable (<10MB warning threshold, though Git configs rarely exceed 10KB)
- Content must be non-empty for default/custom methods

**Derived from**: FR-008, FR-009, FR-010, FR-017

---

### 3. GitIdentity

Represents user identity information for generating a new Git configuration.

**Fields**:
| Field | Type | Required | Validation | Notes |
|-------|------|----------|------------|-------|
| Name | string | Yes | Non-empty, trimmed | user.name in Git config |
| Email | string | Yes | Basic email format | user.email in Git config |

**Validation Rules**:
- **Name**:
  - Must not be empty after trimming whitespace
  - No specific format restrictions (Git accepts any string)
  - Example valid: "John Doe", "Jane Smith-Johnson", "Developer"

- **Email** (FR-013, FR-014):
  - Must contain exactly one `@` symbol
  - Must have non-empty username before `@`
  - Must have domain after `@` with at least one `.`
  - Examples valid: `user@example.com`, `dev+test@company.co.uk`
  - Examples invalid: `@example.com`, `user@`, `user@domain`, `userexample.com`

**Generated Config Format**:
```ini
[user]
	name = {Name}
	email = {Email}
```

**Derived from**: FR-011, FR-012, FR-013

---

### 4. VMGitConfigState

Represents the state of Git configuration in the target VM.

**Fields**:
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Exists | bool | Yes | Whether ~/.gitconfig already exists |
| User | string | Yes | Target user in VM (typically "agent") |
| Path | string | Yes | Target path in VM (typically "/home/agent/.gitconfig") |
| Permissions | string | Yes | Expected permissions (0600) |

**Validation Rules**:
- If Exists is true, skip all Git config operations entirely (FR-015, FR-016)
- Permissions must be set to 0600 (read/write for owner only) when creating new file (FR-018)
- Path is always in the home directory of the agent user

**State Checking**:
```bash
# SSH command to check existence (FR-014)
test -f ~/.gitconfig && echo 'exists' || echo 'missing'
```

**Derived from**: FR-014, FR-015, FR-016, FR-018

---

## Data Flow

### Default Config Flow

```
1. User selects "Default" method
2. System reads local ~/.gitconfig → GitConfigFile
3. Validate GitConfigFile.IsReadable
4. Check VMGitConfigState.Exists via SSH
   → If exists: Skip (FR-015)
   → If missing: Continue
5. Transfer GitConfigFile.Content via SSH (base64-encoded)
6. Set permissions to 0600 on VM
7. Verify transfer success
```

### Custom Config Flow

```
1. User selects "Custom" method
2. Prompt for file path → string
3. Expand path (~/...) to absolute path (FR-010)
4. Load file from path → GitConfigFile
5. Validate GitConfigFile.IsReadable (FR-009)
   → If validation fails: Retry or choose different option (FR-020)
6. Check VMGitConfigState.Exists via SSH
   → If exists: Skip (FR-015)
   → If missing: Continue
7. Transfer GitConfigFile.Content via SSH
8. Set permissions to 0600 on VM
9. Verify transfer success
```

### Create New Config Flow

```
1. User selects "Create New" method
2. Prompt for Name → GitIdentity.Name (FR-011)
3. Validate Name (non-empty)
4. Prompt for Email → GitIdentity.Email (FR-012)
5. Validate Email format (FR-013)
   → If validation fails: Re-prompt (FR-020)
6. Generate .gitconfig content from GitIdentity
7. Check VMGitConfigState.Exists via SSH
   → If exists: Skip (FR-015)
   → If missing: Continue
8. Transfer generated content via SSH
9. Set permissions to 0600 on VM
10. Verify transfer success
```

### Skip Flow

```
1. User selects "Skip" method
2. No Git config operations performed
3. Continue with rest of sandctl init (FR-005, FR-021)
```

---

## Relationships

```
GitConfigMethod
    ├─→ (Default) → GitConfigFile (from ~/.gitconfig)
    ├─→ (Custom) → GitConfigFile (from user-specified path)
    ├─→ (CreateNew) → GitIdentity → Generated GitConfigFile
    └─→ (Skip) → No operations

GitConfigFile + VMGitConfigState → Transfer Decision
    ├─→ VMGitConfigState.Exists == true → Skip transfer (FR-015)
    └─→ VMGitConfigState.Exists == false → Proceed with transfer

Transfer → File Permissions
    └─→ Always set to 0600 (FR-018)
```

---

## Error Handling

### File Not Found
- **Trigger**: os.IsNotExist(err) when checking path
- **Response**: Clear error message (FR-019), prompt for retry or different option (FR-020)
- **Example**: "File not found: /path/to/config. Please check the path and try again."

### Permission Denied (Local)
- **Trigger**: os.IsPermission(err) when checking ~/.gitconfig (FR-007)
- **Response**: Silently disable "Default" option (don't show it in selection list)
- **Rationale**: User may have unusual permissions setup; avoid confusing error messages

### Permission Denied (Custom Path)
- **Trigger**: os.IsPermission(err) when reading custom config file
- **Response**: Clear error message, prompt for retry (FR-019, FR-020)
- **Example**: "Cannot read file: /path/to/config (permission denied). Please check file permissions."

### Invalid Email Format
- **Trigger**: Email validation failure (FR-013)
- **Response**: Clear error message within 2 seconds (SC-003), re-prompt (FR-020)
- **Example**: "Invalid email format: must contain @ and domain (e.g., user@example.com)"

### SSH Transfer Failure
- **Trigger**: sshClient.Exec() returns error during transfer
- **Response**: Clear error message (FR-019), option to retry or skip
- **Example**: "Failed to transfer Git config to VM: {error}. Would you like to retry or skip Git configuration?"

### VM Already Has .gitconfig
- **Trigger**: VMGitConfigState.Exists == true (FR-014)
- **Response**: Skip transfer silently, inform user config was preserved
- **Example**: "VM already has .gitconfig - preserving existing configuration."

---

## Performance Considerations

### File Reading
- Local .gitconfig files are typically <10KB
- Reading is near-instantaneous (<10ms)
- No performance optimization needed for file I/O

### SSH Transfer
- Base64 encoding adds ~33% size overhead
- Typical .gitconfig: 10KB → 13KB encoded
- SSH transfer time: <100ms on typical network
- Meets SC-001 requirement (<30 seconds for default option)

### Validation Feedback
- File path validation: <10ms (single os.Stat call)
- Email validation: <1ms (string operations)
- Meets SC-003 requirement (<2 seconds for invalid input feedback)

---

## Storage

### Local Files
- Source: `~/.gitconfig` or user-specified path (read-only access)
- No modification of local files

### Remote VM Files
- Target: `/home/agent/.gitconfig` (or appropriate user home)
- Permissions: `0600` (read/write for owner only)
- Owner: agent user in VM
- Created only if file doesn't already exist (FR-015)

### Configuration
No changes to existing sandctl configuration files:
- `~/.sandctl/config` (YAML) - No new fields needed
- `~/.sandctl/sessions.json` - No new fields needed

Git config setup is a one-time operation during `sandctl init`; no persistent state stored in sandctl configuration.

---

## Assumptions

1. Git config files use standard INI/Git config format
2. All Git config content can be safely transferred as-is (no transformation needed)
3. The VM has `base64` command available (standard on all Linux distributions)
4. The VM has sufficient disk space for .gitconfig file (<1MB)
5. SSH connection is already established during `sandctl init`
6. Agent user home directory exists in VM before Git config transfer

---

## Future Considerations

**Out of Scope for This Feature**:
- Syncing .gitconfig changes from VM back to local machine
- Merging partial configs (we transfer entire file as-is per FR-017)
- Validating Git config syntax before transfer
- Supporting .gitconfig.d/ include directories
- Supporting Git credential helpers or .git-credentials files
- Conditional includes or platform-specific config sections

These may be addressed in future iterations if user feedback indicates demand.
