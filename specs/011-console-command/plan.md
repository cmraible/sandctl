# Implementation Plan: Console Command

**Branch**: `011-console-command` | **Date**: 2026-01-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/011-console-command/spec.md`

## Summary

Add a new `sandctl console <name>` command that provides SSH-like interactive terminal access to running sandbox sessions. The command leverages the existing WebSocket-based interactive session infrastructure from the `exec` command while focusing exclusively on interactive terminal use cases, refusing non-terminal input and providing a streamlined SSH-like experience.

## Technical Context

**Language/Version**: Go 1.24
**Primary Dependencies**: github.com/spf13/cobra v1.9.1 (CLI), github.com/gorilla/websocket v1.5.1 (WebSocket), golang.org/x/term v0.30.0 (terminal control)
**Storage**: ~/.sandctl/sessions.json (local session store), ~/.sandctl/config (YAML config)
**Testing**: Go testing package with build tags (e2e tag for E2E tests)
**Target Platform**: macOS, Linux (CLI tool)
**Project Type**: Single CLI application
**Performance Goals**: Connection established within 3 seconds, sub-100ms round-trip latency
**Constraints**: Must restore terminal state on exit 100% of the time, must detect non-terminal stdin
**Scale/Scope**: Single-user CLI tool connecting to one sprite at a time

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Code Quality | ✅ PASS | Will follow existing patterns from exec.go, single responsibility per function |
| II. Performance | ✅ PASS | Performance goals defined in spec (3s connect, <100ms latency), will measure |
| III. Security | ✅ PASS | No new credential handling; uses existing sprites_token from config |
| IV. User Privacy | ✅ PASS | No new data collection; command interacts with existing sessions |
| V. E2E Testing | ✅ PASS | Will add E2E tests invoking CLI as user would, black-box approach |

**Quality Gates**:
- Lint & Format: Will pass golangci-lint
- Type Check: Go's static typing, no interface{} without justification
- Unit Tests: Will add for new functions
- E2E Tests: Will add console-specific tests following existing patterns
- Performance: Connection time measurable in E2E tests
- Security Scan: No new dependencies with known vulnerabilities
- Code Review: Required before merge

## Project Structure

### Documentation (this feature)

```text
specs/011-console-command/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (N/A - no new data model)
├── quickstart.md        # Phase 1 output
└── contracts/           # Phase 1 output
    └── cli-interface.md # CLI contract
```

### Source Code (repository root)

```text
internal/
├── cli/
│   ├── root.go          # Shared helpers (getSpritesClient, getSessionStore)
│   ├── exec.go          # Existing exec command (pattern reference)
│   └── console.go       # NEW: Console command implementation
├── sprites/
│   ├── client.go        # Sprites API client
│   └── exec.go          # WebSocket session handling (reused)
├── session/
│   ├── store.go         # Session storage (reused)
│   └── types.go         # Session types (reused)
└── ui/
    └── errors.go        # Error formatting (may extend)

tests/
└── e2e/
    ├── cli_test.go      # E2E tests (extend with console tests)
    └── helpers.go       # Test helpers (reused)
```

**Structure Decision**: Single project structure. New code is one file (`internal/cli/console.go`) plus E2E test additions. Reuses existing infrastructure heavily.

## Constitution Re-Check (Post Phase 1 Design)

| Principle | Status | Verification |
|-----------|--------|--------------|
| I. Code Quality | ✅ PASS | Single file, follows exec.go patterns, ~150 lines |
| II. Performance | ✅ PASS | Reuses proven WebSocket implementation, performance measurable |
| III. Security | ✅ PASS | No new attack surface, reuses existing auth flow |
| IV. User Privacy | ✅ PASS | No data collection, terminal I/O only |
| V. E2E Testing | ✅ PASS | CLI contract defined, testable via black-box approach |

**All gates pass. Ready for task generation.**

## Complexity Tracking

No violations. Implementation is straightforward:
- One new CLI command file (~150 lines)
- Reuses existing WebSocket session infrastructure
- Reuses existing session/sprite validation patterns
- No new dependencies required
