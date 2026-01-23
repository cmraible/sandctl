# Data Model: Human-Readable Sandbox Names

**Feature**: 003-human-readable-names
**Date**: 2026-01-22

## Entities

### Name Pool (new)

A static, embedded list of human first names for random selection.

| Attribute | Type | Description |
|-----------|------|-------------|
| names | []string | Curated list of 250 lowercase first names |

**Constraints**:
- All names must be lowercase
- All names must match pattern `^[a-z]{2,15}$`
- No duplicate names in pool
- Pool is immutable at runtime

**Notes**: The name pool is not persisted; it's compiled into the binary.

### Session (existing, modified)

The `ID` field changes from hex-based to human name format.

| Attribute | Type | Description | Change |
|-----------|------|-------------|--------|
| ID | string | Session identifier | **Modified**: Now a human first name |
| Agent | AgentType | Agent type (claude, opencode, codex) | No change |
| Prompt | string | Task prompt | No change |
| Status | Status | Current state | No change |
| CreatedAt | time.Time | Creation timestamp | No change |
| Timeout | *Duration | Auto-destroy timeout | No change |

**ID Constraints**:
- Must match pattern `^[a-z]{2,15}$`
- Must be unique among active sessions
- Stored in lowercase
- Accepted from user input in any case

## Relationships

```
┌─────────────┐       selects from        ┌────────────┐
│   Session   │◄─────────────────────────│  Name Pool │
│             │                           │            │
│  ID (name)  │                           │  names[]   │
│  Agent      │                           └────────────┘
│  Prompt     │
│  Status     │
│  CreatedAt  │
│  Timeout    │
└─────────────┘
       │
       │ stored in
       ▼
┌─────────────┐
│    Store    │
│             │
│ sessions[]  │──► Local JSON file
└─────────────┘
```

## State Transitions

Session lifecycle remains unchanged:

```
                    ┌─────────────┐
   (name assigned)  │ Provisioning│
   ────────────────►│             │
                    └──────┬──────┘
                           │
            success        │        failure
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                │                ▼
    ┌──────────┐           │          ┌──────────┐
    │ Running  │           │          │  Failed  │
    │          │           │          │          │
    └────┬─────┘           │          └──────────┘
         │                 │
    destroy/timeout        │
         │                 │
         ▼                 │
    ┌──────────┐           │
    │ Stopped  │◄──────────┘
    │          │  (name released back to pool)
    └──────────┘
```

**Name Lifecycle**:
1. Name selected from pool when session created (Provisioning)
2. Name remains reserved while session is active (Running)
3. Name released when session destroyed (Stopped) or fails (Failed)

## Validation Rules

### Name Validation

| Rule | Implementation |
|------|----------------|
| Format | Must match `^[a-z]{2,15}$` after normalization |
| Uniqueness | Must not exist in active sessions |
| Existence | Must exist in name pool (for generation) |

### Session Validation (existing)

| Rule | Implementation |
|------|----------------|
| ID required | Non-empty after normalization |
| Agent valid | Must be valid AgentType |
| Prompt required | Non-empty string |
| Prompt length | Max 10,000 characters |

## JSON Schema

### sessions.json

```json
{
  "sessions": [
    {
      "id": "alice",
      "agent": "claude",
      "prompt": "Build a React todo app",
      "status": "running",
      "created_at": "2026-01-22T10:30:00Z",
      "timeout": "2h"
    },
    {
      "id": "marcus",
      "agent": "opencode",
      "prompt": "Create a REST API",
      "status": "provisioning",
      "created_at": "2026-01-22T10:35:00Z"
    }
  ]
}
```

**Changes from current format**:
- `id` field now contains human name instead of `sandctl-xxxxxxxx`
- All other fields unchanged
