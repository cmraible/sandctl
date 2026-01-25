# Implementation Plan: Rename Start Command to New

**Branch**: `010-rename-start-to-new` | **Date**: 2026-01-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/010-rename-start-to-new/spec.md`

## Summary

Rename the `sandctl start` CLI command to `sandctl new`, remove the required `--prompt` flag, and eliminate the automatic agent start step. The new command provisions a sandbox VM with OpenCode installed but does not auto-start it with a prompt. The Session data model's `Prompt` field is removed entirely.

## Technical Context

**Language/Version**: Go 1.24
**Primary Dependencies**: Cobra (CLI framework), gopkg.in/yaml.v3 (config), golang.org/x/term (secure input)
**Storage**: JSON file at `~/.sandctl/sessions.json`
**Testing**: Go standard testing package, e2e tests with build tag
**Target Platform**: macOS/Linux CLI
**Project Type**: Single project (CLI tool)
**Performance Goals**: N/A (CLI startup, existing behavior)
**Constraints**: Backward-incompatible change (old `start` command will stop working)
**Scale/Scope**: Local CLI tool, single-user

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Code Quality | ✅ Pass | Renaming/removing code follows existing patterns |
| II. Behavior Driven Development | ✅ Pass | Acceptance scenarios defined in spec |
| III. Performance | ✅ Pass | No performance impact (simpler provisioning) |
| IV. Security | ✅ Pass | No new security concerns |
| V. User Privacy | ✅ Pass | Removes prompt data storage (reduces data collection) |

| Gate | Requirement | Status |
|------|-------------|--------|
| Lint & Format | Zero warnings/errors | Will verify |
| Type Check | Full type coverage | Go static typing |
| Unit Tests | All pass | Will update |
| BDD Scenarios | All acceptance tests pass | Will update e2e tests |
| Performance | No regressions > 10% vs baseline | N/A |
| Security Scan | No critical/high vulnerabilities | N/A |
| Code Review | At least one approval | Required |

## Project Structure

### Documentation (this feature)

```text
specs/010-rename-start-to-new/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
internal/
├── cli/
│   ├── new.go           # Renamed from start.go
│   ├── root.go          # Command registration
│   └── ...
├── session/
│   ├── types.go         # Session struct (Prompt field removed)
│   ├── store.go         # Session storage
│   └── ...
└── ...

tests/
├── e2e/
│   ├── cli_test.go      # Update start → new tests
│   └── helpers.go
└── ...
```

**Structure Decision**: Existing single-project structure. The `start.go` file will be renamed to `new.go` and modified.

## Complexity Tracking

No constitution violations requiring justification. This is a straightforward refactoring task.
