# Research: Simplified Init with Opencode Zen

**Feature**: 006-opencode-default-agent
**Date**: 2026-01-22

## Research Tasks

### 1. OpenCode Authentication Method

**Decision**: File-based authentication via `~/.local/share/opencode/auth.json`

**Rationale**: User clarified during spec phase that OpenCode authenticates by creating a JSON file rather than running CLI commands. This is simpler and more reliable than command-based auth.

**File Structure**:
```json
{
  "opencode": {
    "type": "api",
    "key": "<ZEN_KEY>"
  }
}
```

**Alternatives Considered**:
- CLI command (`opencode auth login --key KEY`) - Requires OpenCode CLI to be installed first
- Environment variable - Would not persist across sessions

### 2. Configuration Schema Migration

**Decision**: Remove `default_agent` and `agent_api_keys` fields, replace with single `opencode_zen_key` field

**Rationale**: OpenCode is now the only supported agent. Simplifying the schema removes complexity and potential confusion. The Sprites token remains unchanged.

**New Schema**:
```yaml
sprites_token: "token-value"
opencode_zen_key: "zen-key-value"
```

**Old Schema** (for migration reference):
```yaml
sprites_token: "token-value"
default_agent: "claude"
agent_api_keys:
  claude: "sk-ant-..."
  opencode: "..."
```

**Migration Strategy**:
1. Load existing config (old format is still valid YAML)
2. Preserve `sprites_token`
3. Prompt for new `opencode_zen_key` (don't attempt to migrate old keys)
4. Save in new format (old fields are simply not written)

**Alternatives Considered**:
- Keep `agent_api_keys` with single key - Adds unnecessary complexity
- Auto-migrate existing opencode key - May cause confusion, better to re-prompt

### 3. Secure Key Storage

**Decision**: Plain text in config file with 0600 (owner read/write only) permissions

**Rationale**:
- Already implemented in `config/writer.go`
- Standard practice for CLI tools (similar to SSH keys, AWS credentials)
- System keychain adds complexity without significant benefit for CLI use case

**Alternatives Considered**:
- OS keychain (Keyring, Credential Manager) - Cross-platform complexity
- Encrypted file - Requires key derivation, adds user friction
- Environment variables only - Poor UX for interactive use

### 4. OpenCode Installation in Sandbox

**Decision**: Use `sprites.ExecCommand()` to install OpenCode via curl

**Rationale**:
- Sprites client already supports command execution
- Standard installation pattern for CLI tools
- Allows error handling without blocking sandbox access

**Installation Command** (to be executed in sandbox):
```bash
curl -fsSL https://opencode.ai/install.sh | sh
```

**Alternatives Considered**:
- Pre-baked in sandbox image - Less flexible for updates
- Package manager (apt/brew) - Not universally available

### 5. Session Type Changes

**Decision**: Remove `Agent` field from Session struct

**Rationale**:
- Agent is no longer configurable per-session
- OpenCode is implicit
- Simplifies session management

**Impact**:
- `session/types.go`: Remove `Agent` field
- `cli/start.go`: Remove agent-related logic
- `cli/list.go`: Remove agent display (if shown)

**Alternatives Considered**:
- Keep field with hardcoded value - Adds confusion, no benefit

## Summary of Decisions

| Area | Decision | Impact |
|------|----------|--------|
| Auth Method | JSON file at `~/.local/share/opencode/auth.json` | Low risk, file creation in sandbox |
| Config Schema | Single `opencode_zen_key` field | Breaking change, migration needed |
| Key Storage | Plain text, 0600 permissions | No change from current behavior |
| Installation | curl-based install script | Depends on external URL |
| Session Type | Remove Agent field | Simplification, no user impact |

## Open Questions

None - all technical decisions resolved.

## Dependencies

- OpenCode install script at `https://opencode.ai/install.sh` (assumed available)
- Sprites API `ExecCommand` endpoint (already implemented)
