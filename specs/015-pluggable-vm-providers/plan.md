# Implementation Plan: Pluggable VM Providers

**Branch**: `015-pluggable-vm-providers` | **Date**: 2026-01-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/015-pluggable-vm-providers/spec.md`

## Summary

Replace Fly.io sprites with a pluggable VM provider architecture. Initial implementation uses Hetzner Cloud via the official Go SDK (`hcloud-go`). The provider interface abstracts VM lifecycle operations (create, get, delete, list, exec, console) allowing future providers (AWS, GCP) without CLI code changes. This is a breaking change that removes all sprites functionality.

## Technical Context

**Language/Version**: Go 1.24
**Primary Dependencies**:
- Existing: github.com/spf13/cobra v1.9.1, gopkg.in/yaml.v3 v3.0.1, github.com/gorilla/websocket v1.5.1, golang.org/x/term v0.30.0
- New: github.com/hetznercloud/hcloud-go/v2/hcloud (Hetzner Cloud SDK)
- New: golang.org/x/crypto/ssh (SSH client for console/exec)

**Storage**:
- Config: `~/.sandctl/config` (YAML, 0600 permissions)
- Sessions: `~/.sandctl/sessions.json` (JSON, 0600 permissions)

**Testing**: Go standard `testing` package, E2E tests in `tests/e2e/`

**Target Platform**: macOS, Linux (darwin, linux)

**Project Type**: Single CLI application

**Performance Goals**: VM provisioned and SSH-ready within 5 minutes of `sandctl new`

**Constraints**:
- User provides SSH public key path (no auto-generation)
- Default Hetzner: CPX31 (4 vCPU, 8GB RAM), region ash (Ashburn, VA)
- Breaking change: Fly.io sprites completely removed

**Scale/Scope**: Single-user CLI tool, 1 VM per session

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Code Quality | ✅ PASS | Provider interface enables clean abstractions; existing patterns preserved |
| II. Performance | ✅ PASS | SC-001 defines 5-minute target; Hetzner SDK has built-in retry |
| III. Security | ✅ PASS | API tokens in config (0600), SSH keys user-provided, no secrets in code |
| IV. User Privacy | ✅ PASS | No user data collection; only provider credentials stored locally |
| V. E2E Testing | ✅ PASS | Tests invoke CLI commands; provider abstraction enables mocking |

**Quality Gates Compliance**:
- Lint & Format: Will use existing golangci-lint configuration
- Type Check: Full type coverage via Go's type system
- Unit Tests: New packages will have test files
- E2E Tests: Existing tests updated for new provider system
- Security Scan: No new CVE-prone dependencies (hcloud-go is official Hetzner SDK)

## Project Structure

### Documentation (this feature)

```text
specs/015-pluggable-vm-providers/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (provider interface definition)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
cmd/sandctl/
└── main.go                      # Entry point (unchanged)

internal/
├── cli/                         # CLI commands (modify existing)
│   ├── root.go                  # Update: replace sprites client with provider
│   ├── init.go                  # Update: add provider config prompts
│   ├── new.go                   # Update: use provider interface
│   ├── console.go               # Update: use SSH instead of sprites
│   ├── exec.go                  # Update: use SSH instead of sprites
│   ├── list.go                  # Update: add provider sync, show provider column
│   ├── destroy.go               # Update: use provider interface
│   └── version.go               # (unchanged)
├── config/                      # Configuration (extend existing)
│   ├── config.go                # Update: add provider configs
│   └── writer.go                # (unchanged)
├── session/                     # Session management (extend existing)
│   ├── types.go                 # Update: add Provider, IPAddress, SSHKeyPath fields
│   ├── store.go                 # (unchanged)
│   └── id.go                    # (unchanged)
├── provider/                    # NEW: Provider abstraction layer
│   ├── interface.go             # Provider interface definition
│   ├── registry.go              # Provider registration and lookup
│   ├── types.go                 # Common VM types (CreateOpts, VM, Status)
│   └── errors.go                # Provider-agnostic error types
├── hetzner/                     # NEW: Hetzner Cloud provider
│   ├── provider.go              # Hetzner provider implementation
│   ├── client.go                # Hetzner SDK wrapper
│   ├── ssh_keys.go              # SSH key management
│   ├── setup.go                 # VM setup scripts (Docker, tools)
│   └── provider_test.go         # Unit tests
├── sshexec/                     # NEW: SSH execution layer
│   ├── client.go                # SSH client wrapper
│   ├── exec.go                  # Command execution via SSH
│   ├── console.go               # Interactive terminal via SSH
│   └── client_test.go           # Unit tests
├── sprites/                     # REMOVE: Fly.io Sprites (deleted entirely)
├── ui/                          # UI utilities (unchanged)
└── repo/                        # Repository parsing (unchanged)

tests/e2e/
├── cli_test.go                  # Update: provider-aware tests
├── provider_test.go             # NEW: Provider-specific E2E tests
└── helpers.go                   # Update: add provider test helpers
```

**Structure Decision**: Extend existing single-project structure with new `internal/provider/`, `internal/hetzner/`, and `internal/sshexec/` packages. Remove `internal/sprites/` entirely.

## Complexity Tracking

No constitution violations to justify.

## Post-Design Constitution Re-Check

*Re-evaluation after Phase 1 design artifacts completed.*

| Principle | Status | Design Validation |
|-----------|--------|-------------------|
| I. Code Quality | ✅ PASS | Provider interface in contracts/provider.go defines clean abstraction; single responsibility per package |
| II. Performance | ✅ PASS | WaitReady method with timeout; cloud-init reduces SSH wait time; Hetzner SDK retry built-in |
| III. Security | ✅ PASS | SSH key from user's existing keypair; config 0600 permissions; no secrets in code or logs |
| IV. User Privacy | ✅ PASS | Only stores provider credentials locally; no telemetry or data collection |
| V. E2E Testing | ✅ PASS | Provider abstraction enables mocking; tests via CLI interface only |

**Design Artifacts Generated**:
- `research.md` - 10 key decisions with rationale
- `data-model.md` - 6 entities with validation rules
- `contracts/provider.go` - Provider interface definition
- `quickstart.md` - User-facing setup guide

## Next Steps

Run `/speckit.tasks` to generate implementation tasks from this plan.
