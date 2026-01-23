# Data Model: Init Command

**Feature**: 002-init-command
**Date**: 2026-01-22

## Overview

The init command works with the existing `Config` entity. No new data models are required. This document describes the config structure and the new writing capability.

---

## Entities

### Config (existing)

The configuration entity is already defined in `internal/config/config.go`. The init command will create/update instances of this type.

**Fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| SpritesToken | string | Yes | Fly.io Sprites API authentication token |
| DefaultAgent | AgentType | No | Preferred AI agent (claude, opencode, codex). Defaults to "claude" |
| AgentAPIKeys | map[string]string | No | Map of agent type to API key |

**YAML Representation**:
```yaml
sprites_token: "spr_xxxxxxxxxxxxx"
default_agent: claude
agent_api_keys:
  claude: "sk-ant-xxxxx"
  opencode: "sk-ant-xxxxx"
  codex: "sk-xxxxx"
```

**Validation Rules**:
- `sprites_token` must be non-empty
- `default_agent` must be one of: claude, opencode, codex (or empty for default)
- `agent_api_keys` can be empty or contain keys for any valid agent

---

### AgentType (existing)

Enumeration of supported AI agents.

| Value | Description | API Key Environment |
|-------|-------------|---------------------|
| claude | Anthropic Claude | ANTHROPIC_API_KEY |
| opencode | OpenCode agent | ANTHROPIC_API_KEY |
| codex | OpenAI Codex | OPENAI_API_KEY |

---

## New Components

### ConfigWriter

A new component in `internal/config/writer.go` to handle safe config file creation.

**Responsibilities**:
- Create config directory with 0700 permissions
- Write config file with 0600 permissions
- Use atomic write pattern (temp file + rename)
- Preserve existing config values during reconfiguration

**Interface**:
```go
// Save writes the configuration to the specified path atomically.
// It creates the parent directory if needed with 0700 permissions.
// The config file is created with 0600 permissions.
func Save(path string, cfg *Config) error

// SaveDefault writes to the default config path (~/.sandctl/config).
func SaveDefault(cfg *Config) error
```

---

### PromptResult

Internal structure for collecting init command inputs.

| Field | Type | Description |
|-------|------|-------------|
| SpritesToken | string | User-provided Sprites token |
| Agent | AgentType | Selected default agent |
| APIKey | string | API key for the selected agent |

This is an internal type used only during the init flow; it gets transformed into a Config before saving.

---

## State Transitions

The init command has no persistent state. It operates in a single transaction:

```
Start → Prompt → Validate → Write → Success/Error
```

**Interruption Handling**:
- If interrupted before write: No changes to filesystem
- If interrupted during write: Atomic write ensures either old config remains or new config is complete (never partial)

---

## File System

**Paths**:
- Config directory: `~/.sandctl/` (permissions: 0700)
- Config file: `~/.sandctl/config` (permissions: 0600)

**File Format**: YAML (consistent with existing Load function)

---

## Migration

No migration needed. The init command works with:
1. No existing config → Creates new config
2. Existing valid config → Preserves and updates values
3. Existing invalid config → User re-enters all values (file is replaced)
