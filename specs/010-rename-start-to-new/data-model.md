# Data Model: Rename Start Command to New

**Feature**: 010-rename-start-to-new
**Date**: 2026-01-25

## Entity Changes

### Session (Modified)

**Location**: `internal/session/types.go`

#### Before

```go
type Session struct {
    ID        string    `json:"id"`
    Prompt    string    `json:"prompt"`          // REMOVED
    Status    Status    `json:"status"`
    CreatedAt time.Time `json:"created_at"`
    Timeout   *Duration `json:"timeout,omitempty"`
}
```

#### After

```go
type Session struct {
    ID        string    `json:"id"`
    Status    Status    `json:"status"`
    CreatedAt time.Time `json:"created_at"`
    Timeout   *Duration `json:"timeout,omitempty"`
}
```

#### Field Changes

| Field | Change | Rationale |
|-------|--------|-----------|
| `Prompt` | **Removed** | No longer collected; `sandctl new` does not accept prompts |

### Validation Changes

The `Session.Validate()` method must be updated to remove prompt validation:

#### Before

```go
func (s *Session) Validate() error {
    if s.ID == "" {
        return fmt.Errorf("session ID is required")
    }
    if s.Prompt == "" {
        return fmt.Errorf("prompt is required")
    }
    if len(s.Prompt) > 10000 {
        return fmt.Errorf("prompt exceeds maximum length of 10000 characters")
    }
    return nil
}
```

#### After

```go
func (s *Session) Validate() error {
    if s.ID == "" {
        return fmt.Errorf("session ID is required")
    }
    return nil
}
```

## Storage Format

### sessions.json (Modified)

**Location**: `~/.sandctl/sessions.json`

#### Before

```json
{
  "sessions": [
    {
      "id": "happy-panda",
      "prompt": "Create a React todo app",
      "status": "running",
      "created_at": "2026-01-25T10:00:00Z",
      "timeout": "2h"
    }
  ]
}
```

#### After

```json
{
  "sessions": [
    {
      "id": "happy-panda",
      "status": "running",
      "created_at": "2026-01-25T10:00:00Z",
      "timeout": "2h"
    }
  ]
}
```

### Backward Compatibility Notes

- Existing sessions.json files with `prompt` field will still load (Go's JSON unmarshaling ignores unknown fields by default)
- The `prompt` field will simply be ignored/dropped when re-serialized
- No migration script required

## State Transitions

No changes to state transitions. The `Status` enum and transitions remain:

```
provisioning → running → stopped
     ↓            ↓
   failed      failed
```

## Relationships

No changes to entity relationships. Session still references a Sprite (via the sprites API), but this is an external dependency, not a local data model concern.
