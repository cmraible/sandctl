# Quickstart: Human-Readable Sandbox Names

**Feature**: 003-human-readable-names
**Date**: 2026-01-22

## Overview

This feature replaces cryptic hex-based sandbox IDs with memorable human first names, making it easier to manage sandboxes from the command line.

**Before**: `sandctl destroy sandctl-a1b2c3d4`
**After**: `sandctl destroy alice`

## Implementation Steps

### Step 1: Create Name Pool

Create `internal/session/names.go` with:

1. A curated list of 250 human first names
2. `GetRandomName(usedNames []string)` function that:
   - Selects a random name from the pool
   - Retries if name is already in use
   - Returns error if no names available

```go
// Example structure
var namePool = []string{
    "alice", "bob", "charlie", "diana", "emma", // ...250 total
}

func GetRandomName(usedNames []string) (string, error) {
    // Random selection with collision retry
}
```

### Step 2: Update ID Generation

Modify `internal/session/id.go`:

1. Replace `GenerateID()` signature to accept used names:
   ```go
   func GenerateID(usedNames []string) (string, error)
   ```

2. Change validation pattern from `^sandctl-[a-z0-9]{8}$` to `^[a-z]{2,15}$`

3. Update `ValidateID()` to accept human names

### Step 3: Add Case-Insensitive Lookup

Modify `internal/session/store.go`:

1. Add `NormalizeName()` helper:
   ```go
   func NormalizeName(name string) string {
       return strings.ToLower(strings.TrimSpace(name))
   }
   ```

2. Update `Get()`, `Update()`, `Remove()` to normalize input names

3. Update `Add()` to normalize session ID before storage

4. Add `GetUsedNames()` method to support name generation:
   ```go
   func (s *Store) GetUsedNames() ([]string, error)
   ```

### Step 4: Update CLI Commands

**start.go**:
1. Get used names from store before generating new name
2. Use new `GenerateID(usedNames)` signature
3. Update success message to show human name

**destroy.go** and **exec.go**:
1. Normalize user-provided name before lookup
2. Provide helpful error if name not found

### Step 5: Update Tests

1. Add `internal/session/names_test.go` for name pool tests
2. Update `internal/session/id_test.go` for new validation
3. Update `internal/session/store_test.go` for case-insensitive lookups
4. Update CLI tests for new name format

## Testing Checklist

- [ ] `sandctl start` assigns a human name (no hex, no numbers)
- [ ] `sandctl list` displays human names
- [ ] `sandctl exec alice` works (case-insensitive)
- [ ] `sandctl exec ALICE` works (case-insensitive)
- [ ] `sandctl destroy alice` works
- [ ] Creating multiple sandboxes assigns unique names
- [ ] Name collision is handled (retry selects different name)

## Example Session

```bash
# Start a sandbox
$ sandctl start --prompt "Build a todo app"
Starting session with claude agent...
✓ Provisioning VM
✓ Installing development tools
✓ Starting agent

Session started: marcus
Agent: claude
Prompt: Build a todo app

Use 'sandctl exec marcus' to connect.
Use 'sandctl destroy marcus' when done.

# List sandboxes
$ sandctl list
NAME     AGENT   STATUS   CREATED
marcus   claude  running  2 minutes ago
sofia    codex   running  1 hour ago

# Connect (any case works)
$ sandctl exec Marcus
Connecting to marcus...

# Destroy
$ sandctl destroy marcus
Destroying sandbox 'marcus'...
✓ VM destroyed
✓ Session removed
```

## Files Changed

| File | Change |
|------|--------|
| `internal/session/names.go` | NEW: Name pool and selection |
| `internal/session/names_test.go` | NEW: Name pool tests |
| `internal/session/id.go` | MODIFY: Use name selection |
| `internal/session/id_test.go` | MODIFY: Update validation tests |
| `internal/session/store.go` | MODIFY: Case-insensitive lookups |
| `internal/session/store_test.go` | MODIFY: Case-insensitive tests |
| `internal/cli/start.go` | MODIFY: Pass used names to GenerateID |
| `internal/cli/destroy.go` | MODIFY: Normalize name input |
| `internal/cli/exec.go` | MODIFY: Normalize name input |
