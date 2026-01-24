# Data Model: Simplified Init with Opencode Zen

**Feature**: 006-opencode-default-agent
**Date**: 2026-01-22

## Entities

### Configuration (Modified)

**Location**: `~/.sandctl/config`
**Format**: YAML
**Permissions**: 0600 (owner read/write only)

#### New Schema

```go
// internal/config/config.go

type Config struct {
    SpritesToken   string `yaml:"sprites_token"`
    OpencodeZenKey string `yaml:"opencode_zen_key"`
}
```

**Fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sprites_token` | string | Yes | API token for Fly.io Sprites VM provisioning |
| `opencode_zen_key` | string | Yes | Authentication key for OpenCode AI service |

#### Previous Schema (for reference)

```go
type Config struct {
    SpritesToken string            `yaml:"sprites_token"`
    DefaultAgent AgentType         `yaml:"default_agent"`      // REMOVED
    AgentAPIKeys map[string]string `yaml:"agent_api_keys"`     // REMOVED
}

type AgentType string // REMOVED
```

#### Example Config File

```yaml
# ~/.sandctl/config
sprites_token: "sprites_abc123def456..."
opencode_zen_key: "zen_xyz789..."
```

### Session (Modified)

**Location**: `~/.sandctl/sessions.json`
**Format**: JSON

#### New Schema

```go
// internal/session/types.go

type Session struct {
    ID        string    `json:"id"`         // Human-readable name (e.g., "happy-panda")
    Prompt    string    `json:"prompt"`     // User's task description
    Status    Status    `json:"status"`     // provisioning, running, stopped, failed
    CreatedAt time.Time `json:"created_at"`
    Timeout   *Duration `json:"timeout,omitempty"` // Optional auto-destroy
}

type Status string

const (
    StatusProvisioning Status = "provisioning"
    StatusRunning      Status = "running"
    StatusStopped      Status = "stopped"
    StatusFailed       Status = "failed"
)
```

**Removed Fields**:

| Field | Reason |
|-------|--------|
| `Agent` | OpenCode is now implicit; no agent selection |

### OpenCode Auth File (New - in sandbox)

**Location**: `~/.local/share/opencode/auth.json` (inside sandbox)
**Format**: JSON
**Permissions**: 0600 (created with standard permissions)

#### Schema

```json
{
  "opencode": {
    "type": "api",
    "key": "<OPENCODE_ZEN_KEY>"
  }
}
```

**Fields**:

| Field | Type | Value | Description |
|-------|------|-------|-------------|
| `opencode.type` | string | `"api"` | Authentication type (always "api") |
| `opencode.key` | string | User's key | The Opencode Zen key from sandctl config |

## Validation Rules

### Configuration

| Field | Rule | Error Message |
|-------|------|---------------|
| `sprites_token` | Non-empty string | "Sprites API token is required" |
| `opencode_zen_key` | Non-empty string | "Opencode Zen key is required" |

### Session

| Field | Rule | Error Message |
|-------|------|---------------|
| `ID` | Non-empty, unique | "Session ID is required" / "Session already exists" |
| `Status` | One of valid statuses | "Invalid session status" |

## State Transitions

### Session Status

```
                    ┌──────────────┐
                    │ provisioning │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
        ┌─────────┐  ┌─────────┐  ┌────────┐
        │ running │  │ stopped │  │ failed │
        └────┬────┘  └─────────┘  └────────┘
             │
             ▼
        ┌─────────┐
        │ stopped │
        └─────────┘
```

## Migration

### From Old Config Format

**Detection**: Config file contains `default_agent` or `agent_api_keys` fields

**Strategy**:
1. Load existing YAML (old fields are ignored by new struct)
2. Preserve `sprites_token` if present
3. Prompt user for `opencode_zen_key` (always required)
4. Write new config (old fields not written)

**No automatic key migration**: Old agent keys are not transferred to the new Zen key field because:
- Different authentication systems
- User should explicitly provide the correct Zen key
- Avoids silent misconfiguration
