# Research: Sandbox CLI

**Feature**: 001-sandbox-cli
**Date**: 2026-01-22

## Technology Decisions

### 1. VM Provider: Fly.io Sprites

**Decision**: Use Fly.io Sprites API for VM provisioning and management.

**Rationale**:
- Purpose-built for AI agent sandboxing (comes with Claude pre-installed)
- Fast startup time (1-12 seconds for new sprites)
- Persistent storage with checkpoint/restore capability
- WebSocket-based exec for interactive sessions
- DNS-based network policy controls for security

**Alternatives Considered**:
- AWS EC2: More complex setup, slower cold starts, overkill for ephemeral dev environments
- Docker containers: Not true isolation, shared kernel security concerns for untrusted AI code
- Firecracker directly: Would require building orchestration layer ourselves

**API Endpoints Used**:
| Operation | Endpoint | Method |
|-----------|----------|--------|
| Create sprite | `/v1/sprites` | POST |
| List sprites | `/v1/sprites` | GET |
| Get sprite | `/v1/sprites/{name}` | GET |
| Delete sprite | `/v1/sprites/{name}` | DELETE |
| Execute command | `/v1/sprites/{name}/exec` | WSS |

**Authentication**: Bearer token via `SPRITES_TOKEN` environment variable or config file.

### 2. CLI Framework: Cobra + Viper

**Decision**: Use Cobra for CLI structure and Viper for configuration management.

**Rationale**:
- Industry standard for Go CLIs (used by kubectl, hugo, gh)
- Built-in help generation, flag parsing, subcommand support
- Viper integrates seamlessly for config file + env var support
- Excellent documentation and community support

**Alternatives Considered**:
- urfave/cli: Less structured, weaker subcommand support
- Standard library flag: Too low-level for multi-command CLI
- Kong: Newer, less ecosystem support

### 3. Local Storage: JSON Files

**Decision**: Store session metadata in `~/.sandctl/sessions.json` and config in `~/.sandctl/config`.

**Rationale**:
- Simple, portable, no external dependencies
- Human-readable for debugging
- Sufficient for single-user CLI tool
- Config file separates secrets from session data

**Alternatives Considered**:
- SQLite: Overkill for this use case, adds dependency
- Environment variables only: Can't persist session tracking across commands

### 4. Agent Installation Strategy

**Decision**: Rely on Sprites' pre-installed Claude, install other agents via standard package managers at start time.

**Rationale**:
- Sprites come with Claude pre-installed (default agent)
- opencode and codex can be installed via npm/pip as part of startup script
- Keeps sprite images simple, installation is fast on fresh VMs

**Agent Installation Commands**:
| Agent | Installation |
|-------|--------------|
| claude | Pre-installed on Sprites |
| opencode | `npm install -g @anthropic/opencode` |
| codex | `pip install openai-codex` |

### 5. Progress Display

**Decision**: Use inline progress updates with spinners for long-running operations.

**Rationale**:
- Provisioning takes up to 3 minutes—users need feedback
- Spinners with status text (e.g., "Provisioning VM...", "Installing tools...") provide clear progress
- Compatible with both interactive terminals and CI/CD environments

**Libraries**: `github.com/briandowns/spinner` or `github.com/charmbracelet/bubbletea` for richer TUI

## Security Considerations

### API Key Storage

- Store in `~/.sandctl/config` with file permissions `0600`
- Never log API keys or include in error messages
- Validate config file permissions on load, warn if too permissive

### Input Validation

- Sanitize sprite names (alphanumeric + hyphen only)
- Validate `--timeout` flag format
- Escape shell characters in prompts before passing to agents

### Network Security

- All Sprites API calls over HTTPS
- WebSocket connections use WSS (TLS)
- Consider implementing DNS-based network policies for sprites to limit outbound access

## Performance Considerations

### Startup Time

- CLI binary should start in < 100ms
- Lazy-load Sprites client only when needed
- Cache authentication token validation

### API Call Optimization

- Use single API call for `list` command (no N+1 queries)
- Implement connection pooling for WebSocket exec sessions
- Set reasonable timeouts (30s for API calls, longer for provisioning)

## Open Questions (Resolved)

| Question | Resolution |
|----------|------------|
| VM provider? | Fly.io Sprites (per clarification) |
| Output retrieval? | Git push from within VM (per clarification) |
| API key storage? | ~/.sandctl/config (per clarification) |
| Session timeout? | No default, optional --timeout flag (per clarification) |
