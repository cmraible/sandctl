# Implementation Plan: Cloud-Init Agent User

**Branch**: `017-cloud-init-agent-user` | **Date**: 2026-01-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/017-cloud-init-agent-user/spec.md`

## Summary

Create a non-root "agent" user during VM provisioning via cloud-init, streamline package installation by removing language runtimes (nodejs, python), and change all SSH connections to use the agent user instead of root. Repositories cloned via `--repo` will be placed in `/home/agent/<repo-name>` with proper ownership.

## Technical Context

**Language/Version**: Go 1.24.0
**Primary Dependencies**: github.com/spf13/cobra v1.9.1 (CLI), golang.org/x/crypto/ssh (SSH client), gopkg.in/yaml.v3 (config)
**Storage**: ~/.sandctl/sessions.json (local session store), ~/.sandctl/config (YAML config)
**Testing**: Go standard testing package (`go test`)
**Target Platform**: macOS/Linux CLI tool, provisioning Ubuntu 24.04 VMs on Hetzner Cloud
**Project Type**: Single CLI application
**Performance Goals**: VM provisioning time should decrease due to fewer package installations
**Constraints**: Cloud-init script must complete within Hetzner's VM boot timeout; SSH must work immediately after cloud-init completes
**Scale/Scope**: Single-user CLI tool for developer workflows

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Phase 0 Check ✅

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Code Quality | ✅ PASS | Changes are minimal and self-documenting; single-responsibility maintained |
| II. Performance | ✅ PASS | Fewer packages = faster provisioning (measurable improvement) |
| III. Security | ✅ PASS | Non-root user follows least privilege; passwordless sudo is acceptable per spec assumptions (dev/agent VMs) |
| IV. User Privacy | ✅ PASS | No user data collection changes |
| V. E2E Testing | ✅ PASS | E2E tests will verify user-visible behavior (SSH connects as agent, repos in correct location) |

### Post-Phase 1 Re-Check ✅

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Code Quality | ✅ PASS | Design maintains single responsibility: setup.go handles VM config, client.go handles SSH, parser.go handles repo specs |
| II. Performance | ✅ PASS | Removing 4 packages (nodejs, npm, python3, pip) reduces install time. Measurable via provisioning timing. |
| III. Security | ✅ PASS | Non-root default improves security posture. SSH key copying uses secure permissions (700/600). Sudoers uses /etc/sudoers.d/ (safe pattern). |
| IV. User Privacy | ✅ PASS | No changes to data collection. No new telemetry. |
| V. E2E Testing | ✅ PASS | Tests will invoke `sandctl console` and verify agent user via `whoami`. Black-box approach maintained. |

**Quality Gates**:
- Lint & Format: Code will pass `go fmt` and `go vet`
- Type Check: Go's static typing maintained, no unsafe operations
- Unit Tests: New tests for modified functions
- E2E Tests: Verify SSH user and repo clone location
- Security Scan: No new vulnerabilities introduced

## Project Structure

### Documentation (this feature)

```text
specs/017-cloud-init-agent-user/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
internal/
├── hetzner/
│   └── setup.go         # CloudInitScript(), CloudInitScriptWithRepo() - MODIFY
├── sshexec/
│   └── client.go        # defaultSSHUser constant - MODIFY
└── repo/
    └── parser.go        # TargetPath() method - MODIFY

tests/
└── e2e/
    └── e2e_test.go      # Add tests for agent user verification
```

**Structure Decision**: Single project layout. This feature modifies three existing files in the `internal/` directory with minimal changes.

## Complexity Tracking

> No constitution violations requiring justification. Changes are minimal and follow existing patterns.

## Files to Modify

| File | Change Description |
|------|-------------------|
| `internal/hetzner/setup.go` | Update CloudInitScript() to: create agent user, setup SSH keys, grant sudo, remove nodejs/python |
| `internal/sshexec/client.go` | Change `defaultSSHUser` from "root" to "agent" |
| `internal/repo/parser.go` | Change TargetPath() from "/root/" to "/home/agent/" |
| `internal/hetzner/setup.go` | Update CloudInitScriptWithRepo() to clone as agent user with proper ownership |

## Implementation Phases

### Phase 0: Research (Complete)
- Cloud-init user creation best practices
- SSH authorized_keys propagation
- Sudoers configuration
- File ownership in git clone

### Phase 1: Design (Complete)
- Cloud-init script structure finalized
- No new data models required
- No API contracts (CLI tool)

### Phase 2: Implementation (via /speckit.tasks)
See tasks.md for detailed implementation tasks.
