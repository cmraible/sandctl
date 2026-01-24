# Implementation Plan: E2E Test Suite Improvement

**Branch**: `008-e2e-test-suite` | **Date**: 2026-01-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-e2e-test-suite/spec.md`

## Summary

Replace the existing e2e test suite that calls Sprites API directly with a new suite that invokes sandctl CLI commands via `exec.Command`. The new tests will cover all 6 sandctl commands (init, start, list, exec, destroy, version) with human-readable test names following the `sandctl <command> > <description>` format.

## Technical Context

**Language/Version**: Go 1.23.0
**Primary Dependencies**: Cobra (CLI framework), `os/exec` (command execution), `testing` (Go standard test framework)
**Storage**: N/A (test artifacts use temp directories)
**Testing**: `go test -tags=e2e ./tests/e2e/...`
**Target Platform**: Linux/macOS (CI: ubuntu-latest)
**Project Type**: Single CLI application
**Performance Goals**: Tests complete within reasonable CI time limits (session provisioning ~2 min)
**Constraints**: Requires `SPRITES_API_TOKEN` environment variable for API access
**Scale/Scope**: 6 commands to test, ~10-15 test cases total

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Code Quality | ✅ Pass | Tests will follow Go conventions, clear naming |
| II. Behavior Driven Development | ✅ Pass | Tests verify user-facing CLI behavior |
| III. Performance | ✅ Pass | No performance regression expected (test code only) |
| IV. Security | ✅ Pass | API token from environment variable (not hardcoded) |
| V. User Privacy | ✅ Pass | No user data collected by tests |

**Quality Gates**:
- Lint & Format: Will pass `golangci-lint`
- Type Check: Full Go type coverage
- Unit Tests: N/A (these are e2e tests)
- BDD Scenarios: Tests implement acceptance scenarios from spec

## Project Structure

### Documentation (this feature)

```text
specs/008-e2e-test-suite/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (minimal for test-only feature)
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
tests/
└── e2e/
    ├── e2e_test.go      # DELETE: Current API-direct tests (to be removed)
    ├── helpers_test.go  # DELETE: Current API-direct helpers (to be removed)
    ├── cli_test.go      # NEW: CLI command tests
    └── helpers.go       # NEW: CLI execution helpers
```

**Structure Decision**: Minimal change - replace contents of existing `tests/e2e/` directory. Keep same location but change implementation to invoke CLI commands instead of API directly.

## Complexity Tracking

No constitution violations requiring justification.
