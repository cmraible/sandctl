# Implementation Plan: Sandbox CLI

**Branch**: `001-sandbox-cli` | **Date**: 2026-01-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-sandbox-cli/spec.md`

## Summary

Build a CLI tool (`sandctl`) for managing sandboxed AI web development agents using Fly.io Sprites. The CLI provides four core commands: `start` (provision VM + launch agent), `list` (show active sessions), `exec` (SSH into VM), and `destroy` (terminate VM). API keys are stored in `~/.sandctl/config` and injected into VMs at start time.

## Technical Context

**Language/Version**: Go 1.22+
**Primary Dependencies**: Cobra (CLI framework), Viper (config), Fly.io Sprites SDK
**Storage**: Local file (`~/.sandctl/config` for API keys, `~/.sandctl/sessions.json` for session tracking)
**Testing**: Go testing package with table-driven tests
**Target Platform**: macOS, Linux (cross-compiled binaries)
**Project Type**: Single CLI application
**Performance Goals**: VM provisioning < 3 minutes, list/exec commands < 10 seconds
**Constraints**: Requires network connectivity, Fly.io authentication
**Scale/Scope**: Single user, multiple concurrent sessions

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Code Quality | ✅ Pass | Go with strict typing, golangci-lint, gofmt |
| II. BDD | ✅ Pass | Spec has Given/When/Then scenarios for all commands |
| III. Performance | ✅ Pass | Measurable goals defined (SC-001 through SC-004) |
| IV. Security | ✅ Pass | API keys in config file (not env), validated input, no secrets in logs |
| V. User Privacy | ✅ Pass | Minimal data collection (session IDs, prompts stored locally only) |

**Quality Gates Compliance**:
- Lint & Format: golangci-lint + gofmt enforced
- Type Check: Go's static typing
- Unit Tests: Required for all packages
- BDD Scenarios: Acceptance tests per user story
- Performance: Benchmark tests for critical paths
- Security Scan: govulncheck for dependency audit

## Project Structure

### Documentation (this feature)

```text
specs/001-sandbox-cli/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (CLI interface spec)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
cmd/
└── sandctl/
    └── main.go          # Entry point

internal/
├── cli/
│   ├── root.go          # Root command, global flags
│   ├── start.go         # sandctl start
│   ├── list.go          # sandctl list
│   ├── exec.go          # sandctl exec
│   └── destroy.go       # sandctl destroy
├── config/
│   └── config.go        # Config file management (~/.sandctl/config)
├── sprites/
│   └── client.go        # Fly.io Sprites API client wrapper
├── session/
│   └── store.go         # Local session tracking
└── ui/
    └── progress.go      # Progress display helpers

tests/
├── integration/         # End-to-end tests against real Sprites API
└── unit/                # Unit tests for internal packages
```

**Structure Decision**: Single CLI project with internal packages for separation of concerns. No external backend needed—all state is local or in Fly.io Sprites.

## Complexity Tracking

No constitution violations requiring justification.
