# Implementation Plan: Repository Clone on Sprite Creation

**Branch**: `013-repo-clone` | **Date**: 2026-01-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/013-repo-clone/spec.md`

## Summary

Add a `--repo` (`-R`) flag to the `sandctl new` command that clones a GitHub repository into the sprite during provisioning. The repository is cloned to `/home/sprite/{repo-name}`, and the console session starts in that directory.

## Technical Context

**Language/Version**: Go 1.24
**Primary Dependencies**: github.com/spf13/cobra v1.9.1 (CLI), golang.org/x/term v0.30.0 (terminal)
**Storage**: ~/.sandctl/sessions.json (local session store), ~/.sandctl/config (YAML config)
**Testing**: Go standard testing + E2E tests with build tags (`-tags=e2e`)
**Target Platform**: macOS, Linux (darwin, linux amd64/arm64)
**Project Type**: Single CLI application
**Performance Goals**: Clone completes within 10-minute timeout; average repos clone in under 5 minutes
**Constraints**: Public GitHub repos only; git must be pre-installed in sprite
**Scale/Scope**: Single user CLI tool; one clone operation per sprite creation

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance | Notes |
|-----------|------------|-------|
| I. Code Quality | ✅ Pass | New code follows existing patterns in `internal/cli/new.go` |
| II. Performance | ✅ Pass | 10-minute timeout specified; measurable clone duration |
| III. Security | ✅ Pass | Only public repos (no credentials); input validation on repo format |
| IV. User Privacy | ✅ Pass | No user data collected; no telemetry |
| V. E2E Testing | ✅ Pass | Tests invoke CLI directly; black-box approach |

**Quality Gates**:
- Lint & Format: CI automated (golangci-lint)
- Type Check: Go static typing
- Unit Tests: Required for new functions
- E2E Tests: New test for `sandctl new -R` workflow
- Code Review: Required before merge

## Project Structure

### Documentation (this feature)

```text
specs/013-repo-clone/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # N/A - no API contracts for this feature
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
cmd/sandctl/
└── main.go              # Entry point (no changes needed)

internal/
├── cli/
│   ├── new.go           # Primary changes: add --repo flag and clone step
│   ├── console.go       # Modify: accept starting directory parameter
│   └── root.go          # No changes
├── sprites/
│   └── client.go        # No changes (ExecCommand already supports long commands)
├── session/
│   └── types.go         # Consider: add ClonedRepo field to Session struct
└── repo/                # NEW: repository parsing and validation
    ├── parser.go        # Parse owner/repo or full URL format
    └── parser_test.go   # Unit tests for parser

tests/
└── e2e/
    ├── cli_test.go      # Add new test cases for --repo flag
    └── helpers.go       # No changes
```

**Structure Decision**: Single project structure. New `internal/repo` package for repository URL parsing logic to keep concerns separated.

## Complexity Tracking

> No constitution violations requiring justification.

| Decision | Rationale |
|----------|-----------|
| Separate `internal/repo` package | Keeps parsing/validation logic testable and separate from CLI |
| Clone via `ExecCommand` | Reuses existing API; 10-minute timeout via custom client |
| Working directory via shell | Use `cd /path && exec shell` pattern for console |
