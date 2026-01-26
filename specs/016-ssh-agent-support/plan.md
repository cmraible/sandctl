# Implementation Plan: SSH Agent Support

**Branch**: `016-ssh-agent-support` | **Date**: 2026-01-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/016-ssh-agent-support/spec.md`

## Summary

Enable sandctl to use SSH keys managed by external SSH agents (1Password, ssh-agent, gpg-agent) during initialization, eliminating the requirement for public key files on disk. The implementation will auto-detect SSH agent availability, allow key selection from available agent keys, and store the public key content inline in configuration for VM provisioning.

## Technical Context

**Language/Version**: Go 1.24.0
**Primary Dependencies**: github.com/spf13/cobra v1.9.1 (CLI), golang.org/x/crypto/ssh (SSH client/agent), gopkg.in/yaml.v3 (config), golang.org/x/term (terminal detection)
**Storage**: YAML file at `~/.sandctl/config` (0600 permissions)
**Testing**: Go standard testing framework (`go test`)
**Target Platform**: macOS, Linux (CLI tool)
**Project Type**: Single CLI application
**Performance Goals**: Init command should complete in <5s excluding network latency to SSH agent
**Constraints**: Must maintain backward compatibility with existing ssh_public_key file path configuration
**Scale/Scope**: Single user CLI tool, typically 1-10 keys in SSH agent

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance | Notes |
|-----------|------------|-------|
| I. Code Quality | ✅ PASS | Changes follow existing patterns in `internal/cli/init.go` and `internal/config/config.go` |
| II. Performance | ✅ PASS | SSH agent communication is local IPC, inherently fast (<100ms) |
| III. Security | ✅ PASS | Uses standard SSH agent protocol; no private keys stored on disk; config file remains 0600 |
| IV. User Privacy | ✅ PASS | Only stores public key content and fingerprint; no telemetry |
| V. E2E Testing | ✅ PASS | Can test via CLI invocation with mocked agent socket |

**Pre-Phase 0 Gate**: PASSED

## Project Structure

### Documentation (this feature)

```text
specs/016-ssh-agent-support/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
cmd/
└── sandctl/
    └── main.go              # Entry point (no changes)

internal/
├── cli/
│   ├── init.go              # MODIFY: Add SSH agent flow, new flags
│   └── init_test.go         # MODIFY: Add tests for agent flow
├── config/
│   ├── config.go            # MODIFY: Add SSHPublicKeyInline, SSHKeyFingerprint fields
│   └── config_test.go       # MODIFY: Add validation tests
├── sshexec/
│   └── client.go            # EXISTING: Already has agent support for connections
└── sshagent/                # NEW: SSH agent interaction module
    ├── agent.go             # SSH agent discovery and key listing
    └── agent_test.go        # Unit tests

tests/
└── e2e/
    └── init_test.go         # MODIFY: Add E2E tests for SSH agent init
```

**Structure Decision**: This is a CLI application using the existing Go project structure. Changes are concentrated in `internal/cli/init.go` for the command flow, `internal/config/config.go` for data model changes, and a new `internal/sshagent/` package for SSH agent interactions (keeping separation of concerns from the existing `sshexec` package which handles SSH connections).

## Complexity Tracking

No constitution violations. The implementation follows existing patterns and introduces minimal new complexity.
