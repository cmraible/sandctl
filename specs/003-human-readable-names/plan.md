# Implementation Plan: Human-Readable Sandbox Names

**Branch**: `003-human-readable-names` | **Date**: 2026-01-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-human-readable-names/spec.md`

## Summary

Replace the current hex-based session IDs (`sandctl-a1b2c3d4`) with randomly selected human first names (`alice`, `marcus`, `sofia`) to make sandbox management more user-friendly. Users will be able to type sandbox names from memory instead of copy-pasting cryptic identifiers.

## Technical Context

**Language/Version**: Go 1.22
**Primary Dependencies**: Cobra (CLI), gopkg.in/yaml.v3 (config), golang.org/x/term
**Storage**: Local JSON file at `~/.sandctl/sessions.json`
**Testing**: Go standard testing (`go test`)
**Target Platform**: macOS, Linux (CLI application)
**Project Type**: Single CLI application
**Performance Goals**: Name generation under 1ms, collision check under 10ms
**Constraints**: Must support 200+ unique names, case-insensitive lookups
**Scale/Scope**: Typical usage: 1-20 concurrent sandboxes per user

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Requirement | Status | Notes |
|-----------|-------------|--------|-------|
| I. Code Quality | Self-documenting, single responsibility, type safety | ✅ Pass | Names package has clear purpose |
| II. BDD | Given/When/Then scenarios defined | ✅ Pass | Spec has acceptance scenarios |
| III. Performance | Measurable goals defined | ✅ Pass | Name gen <1ms, collision <10ms |
| IV. Security | Input validation, no secrets exposure | ✅ Pass | Names are case-insensitive, validated |
| V. User Privacy | Data minimization | ✅ Pass | Only stores name, no PII |

**Quality Gates**:
- Lint & Format: Will enforce via `go fmt` and `golangci-lint`
- Type Check: Go is statically typed
- Unit Tests: Required for name generation and store changes
- BDD Scenarios: Acceptance tests for name assignment and collision handling

## Project Structure

### Documentation (this feature)

```text
specs/003-human-readable-names/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (N/A for CLI)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
internal/
├── session/
│   ├── id.go            # MODIFY: Replace hex ID generation with name selection
│   ├── id_test.go       # MODIFY: Update tests for name generation
│   ├── names.go         # NEW: Name pool and selection logic
│   ├── names_test.go    # NEW: Tests for name pool
│   ├── store.go         # MODIFY: Case-insensitive lookups
│   ├── store_test.go    # MODIFY: Update store tests
│   └── types.go         # No changes expected
├── cli/
│   ├── start.go         # MODIFY: Use new name generation
│   ├── destroy.go       # MODIFY: Case-insensitive name matching
│   ├── exec.go          # MODIFY: Case-insensitive name matching
│   └── list.go          # No changes (names display as-is)
└── ...
```

**Structure Decision**: Single project structure with changes concentrated in `internal/session/` for name generation and `internal/cli/` for command updates.

## Complexity Tracking

> No constitution violations. Feature is straightforward replacement of ID scheme.

| Item | Decision | Rationale |
|------|----------|-----------|
| Name pool size | 200+ names embedded in code | Simpler than external file; covers typical usage |
| Collision handling | Retry with different random name | Simpler than fallback to numbered suffix |
| Case handling | Store lowercase, accept any case | Standard UX pattern for identifiers |
