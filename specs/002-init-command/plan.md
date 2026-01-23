# Implementation Plan: Init Command

**Branch**: `002-init-command` | **Date**: 2026-01-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-init-command/spec.md`

## Summary

Add an `init` command to sandctl that guides users through interactive configuration setup. The command prompts for Sprites token, default AI agent selection, and agent API key, then creates a secure configuration file with proper permissions (0600). Supports both interactive and non-interactive (flag-based) modes.

## Technical Context

**Language/Version**: Go 1.22+
**Primary Dependencies**: Cobra (CLI framework), gopkg.in/yaml.v3 (config serialization), golang.org/x/term (secure input)
**Storage**: YAML file at `~/.sandctl/config`
**Testing**: go test with BDD-style naming conventions (Given/When/Then)
**Target Platform**: macOS, Linux (CLI application)
**Project Type**: Single CLI application
**Performance Goals**: Init completes in < 2 minutes with user interaction
**Constraints**: Config file must have 0600 permissions; tokens must not echo to terminal
**Scale/Scope**: Single-user CLI configuration

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Code Quality | ✅ PASS | Single-purpose init command; follows existing CLI patterns |
| II. Behavior Driven Development | ✅ PASS | Spec has Given/When/Then scenarios; tests will use BDD naming |
| III. Performance | ✅ PASS | < 2 minutes target in SC-001; no heavy computation |
| IV. Security | ✅ PASS | FR-005/FR-010: 0600 permissions, masked input for secrets |
| V. User Privacy | ✅ PASS | Minimal data (tokens stored locally only); user-controlled |

| Gate | Requirement | Status |
|------|-------------|--------|
| Lint & Format | Zero warnings | Will use golangci-lint |
| Type Check | Full type coverage | Go is statically typed |
| Unit Tests | All pass | BDD-style tests per existing pattern |
| BDD Scenarios | All acceptance tests pass | Mapped from spec |
| Performance | No regressions > 10% | N/A - new command |
| Security Scan | No critical/high vulnerabilities | go mod tidy + govulncheck |
| Code Review | At least one approval | Required |

## Project Structure

### Documentation (this feature)

```text
specs/002-init-command/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # N/A - CLI, no API
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
cmd/
└── sandctl/
    └── main.go              # Entry point (existing)

internal/
├── cli/
│   ├── root.go              # Root command (existing)
│   ├── init.go              # NEW: init command implementation
│   └── init_test.go         # NEW: init command tests
├── config/
│   ├── config.go            # Config types and loading (existing)
│   ├── config_test.go       # Config tests (existing)
│   ├── writer.go            # NEW: Config file writing
│   └── writer_test.go       # NEW: Writer tests
└── ui/
    ├── prompt.go            # NEW: Interactive prompts
    └── prompt_test.go       # NEW: Prompt tests
```

**Structure Decision**: Follows existing Go project layout. New files added to existing packages to maintain cohesion. Config writing separated from loading for single responsibility.

## Complexity Tracking

No violations to justify - design follows existing patterns with minimal additions.
