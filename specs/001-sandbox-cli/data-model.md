# Data Model: Sandbox CLI

**Feature**: 001-sandbox-cli
**Date**: 2026-01-22

## Entities

### Session

Represents a sandboxed VM instance managed by sandctl.

```go
type Session struct {
    ID        string    `json:"id"`         // Unique identifier (sprite name)
    Agent     AgentType `json:"agent"`      // Agent type running in session
    Prompt    string    `json:"prompt"`     // User's original prompt
    Status    Status    `json:"status"`     // Current session status
    CreatedAt time.Time `json:"created_at"` // When session was started
    Timeout   *Duration `json:"timeout"`    // Optional auto-destroy timeout
}
```

**Fields**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| ID | string | Yes | Sprite name, format: `sandctl-{random-8-chars}` |
| Agent | AgentType | Yes | One of: claude, opencode, codex |
| Prompt | string | Yes | The task prompt passed to the agent |
| Status | Status | Yes | provisioning, running, stopped, failed |
| CreatedAt | time.Time | Yes | UTC timestamp of session creation |
| Timeout | *Duration | No | If set, session auto-destroys after this duration |

**Validation Rules**:
- ID must match pattern `^sandctl-[a-z0-9]{8}$`
- Prompt must be non-empty, max 10,000 characters
- Status transitions: provisioning → running → stopped (or failed at any point)

### AgentType

Enumeration of supported AI coding agents.

```go
type AgentType string

const (
    AgentClaude   AgentType = "claude"
    AgentOpencode AgentType = "opencode"
    AgentCodex    AgentType = "codex"
)
```

**Validation**: Must be one of the defined constants.

### Status

Enumeration of session lifecycle states.

```go
type Status string

const (
    StatusProvisioning Status = "provisioning"
    StatusRunning      Status = "running"
    StatusStopped      Status = "stopped"
    StatusFailed       Status = "failed"
)
```

**State Transitions**:
```
                    ┌─────────────┐
                    │ provisioning│
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            │
        ┌─────────┐  ┌─────────┐       │
        │ running │  │  failed │◄──────┘
        └────┬────┘  └─────────┘
             │
             ▼
        ┌─────────┐
        │ stopped │
        └─────────┘
```

### Config

Application configuration stored in `~/.sandctl/config`.

```go
type Config struct {
    SpritesToken   string            `yaml:"sprites_token"`   // Fly.io Sprites API token
    DefaultAgent   AgentType         `yaml:"default_agent"`   // Default agent (claude)
    AgentAPIKeys   map[string]string `yaml:"agent_api_keys"`  // Agent-specific API keys
}
```

**Fields**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| SpritesToken | string | Yes | Fly.io Sprites API bearer token |
| DefaultAgent | AgentType | No | Default agent if --agent not specified (default: claude) |
| AgentAPIKeys | map | Yes | Map of agent name to API key (e.g., ANTHROPIC_API_KEY) |

**Example Config File** (`~/.sandctl/config`):
```yaml
sprites_token: "sprites_xxx..."
default_agent: claude
agent_api_keys:
  claude: "sk-ant-xxx..."
  opencode: "sk-ant-xxx..."
  codex: "sk-xxx..."
```

**Security**:
- File permissions MUST be `0600` (owner read/write only)
- Tokens MUST NOT be logged or included in error messages

## Local Storage

### Sessions Store

File: `~/.sandctl/sessions.json`

```json
{
  "sessions": [
    {
      "id": "sandctl-a1b2c3d4",
      "agent": "claude",
      "prompt": "Create a React todo app",
      "status": "running",
      "created_at": "2026-01-22T10:30:00Z",
      "timeout": null
    }
  ]
}
```

**Operations**:
- `Add(session)`: Append new session
- `Update(id, status)`: Update session status
- `Remove(id)`: Delete session record
- `List()`: Return all sessions
- `Get(id)`: Return single session by ID

**Concurrency**: File-level locking for multi-process safety (flock).

## Sprites API Mapping

| Local Entity | Sprites API | Notes |
|--------------|-------------|-------|
| Session.ID | Sprite name | Used as unique identifier |
| Session.Status | Sprite state | Mapped from API response |
| Config.SpritesToken | Authorization header | Bearer token |

## Relationships

```
┌──────────┐         ┌───────────┐
│  Config  │────────▶│  Session  │
└──────────┘         └───────────┘
     │                     │
     │ provides            │ uses
     │ credentials         │ agent type
     ▼                     ▼
┌──────────┐         ┌───────────┐
│ Sprites  │         │   Agent   │
│   API    │◀────────│   Type    │
└──────────┘         └───────────┘
```
