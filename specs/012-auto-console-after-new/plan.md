# Implementation Plan: Auto Console After New

**Branch**: `012-auto-console-after-new` | **Date**: 2026-01-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/012-auto-console-after-new/spec.md`

## Summary

Modify the `sandctl new` command to automatically start an interactive console session after provisioning completes. This reduces user friction by combining session creation and connection into a single command. The feature reuses the existing console infrastructure from feature 011-console-command, adding a `--no-console` flag for backward compatibility with scripts and automatic detection of non-interactive terminals.

## Technical Context

**Language/Version**: Go 1.24
**Primary Dependencies**: github.com/spf13/cobra v1.9.1 (CLI), golang.org/x/term v0.30.0 (terminal detection)
**Storage**: ~/.sandctl/sessions.json (local session store), ~/.sandctl/config (YAML config)
**Testing**: Go testing package with build tags (e2e tag for E2E tests)
**Target Platform**: macOS, Linux (CLI tool)
**Project Type**: Single CLI application
**Performance Goals**: Console connection adds no more than 3 seconds to provisioning time
**Constraints**: Must restore terminal state on exit, must detect non-TTY stdin, backward compatible with existing scripts
**Scale/Scope**: Single-user CLI tool connecting to one sprite at a time

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Code Quality | ✅ PASS | Modification to existing file, reuses console command functions |
| II. Performance | ✅ PASS | Console connection time measurable, spec requires <3s overhead |
| III. Security | ✅ PASS | No new credential handling; reuses existing auth flow |
| IV. User Privacy | ✅ PASS | No data collection; terminal I/O only |
| V. E2E Testing | ✅ PASS | Will verify existing tests still pass with --no-console behavior |

**Quality Gates**:
- Lint & Format: Will pass golangci-lint
- Type Check: Go's static typing, no interface{} without justification
- Unit Tests: Existing tests continue to work
- E2E Tests: Existing new command tests work with --no-console flag
- Performance: Console connection time measurable in E2E tests
- Security Scan: No new dependencies
- Code Review: Required before merge

## Project Structure

### Documentation (this feature)

```text
specs/012-auto-console-after-new/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output
├── quickstart.md        # Phase 1 output
└── contracts/           # Phase 1 output
    └── cli-interface.md # CLI contract updates
```

### Source Code (repository root)

```text
internal/
├── cli/
│   ├── root.go          # Shared helpers (getSpritesClient, getSessionStore)
│   ├── console.go       # Existing console command (reused functions)
│   └── new.go           # MODIFIED: Add auto-console after provisioning
└── ...

tests/
└── e2e/
    ├── cli_test.go      # E2E tests (modify to use --no-console where needed)
    └── helpers.go       # Test helpers (reused)
```

**Structure Decision**: Single project structure. Modification to one existing file (`internal/cli/new.go`) plus test updates. Reuses console infrastructure from `internal/cli/console.go`.

## Constitution Re-Check (Post Phase 1 Design)

| Principle | Status | Verification |
|-----------|--------|-----------------|
| I. Code Quality | ✅ PASS | Single file modification, ~30 lines added, reuses existing functions |
| II. Performance | ✅ PASS | Reuses proven console implementation, performance overhead minimal |
| III. Security | ✅ PASS | No new attack surface, reuses existing auth flow |
| IV. User Privacy | ✅ PASS | No data collection, terminal I/O only |
| V. E2E Testing | ✅ PASS | CLI contract defined, testable via black-box approach |

**All gates pass. Ready for task generation.**

## Complexity Tracking

No violations. Implementation is straightforward:
- One existing CLI file modified (~30 lines added)
- Reuses existing console session functions from console.go
- No new dependencies required
- Backward compatible via --no-console flag
