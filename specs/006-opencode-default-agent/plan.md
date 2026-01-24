# Implementation Plan: Simplified Init with Opencode Zen

**Branch**: `006-opencode-default-agent` | **Date**: 2026-01-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-opencode-default-agent/spec.md`

## Summary

Simplify the `sandctl init` command to collect only two credentials (Sprites API token and Opencode Zen key) instead of the current multi-agent setup. Remove agent selection entirely—OpenCode is now the implicit default. During sandbox provisioning, automatically create the OpenCode authentication file (`~/.local/share/opencode/auth.json`) to pre-authenticate the user.

## Technical Context

**Language/Version**: Go 1.23.0
**Primary Dependencies**: Cobra (CLI), gopkg.in/yaml.v3 (config), golang.org/x/term (secure input)
**Storage**: YAML file at `~/.sandctl/config` (0600 permissions), JSON at `~/.sandctl/sessions.json`
**Testing**: Standard Go testing (`go test`), existing test patterns in `*_test.go` files
**Target Platform**: macOS (darwin) and Linux (amd64, arm64)
**Project Type**: Single CLI application
**Performance Goals**: Init completes in under 10 seconds (no network calls)
**Constraints**: Config file must have 0600 permissions for security
**Scale/Scope**: Single-user CLI tool

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Code Quality | ✅ Pass | Changes follow existing patterns, self-documenting code |
| II. Behavior Driven Development | ✅ Pass | Acceptance scenarios defined in spec, testable |
| III. Performance | ✅ Pass | Init has no network calls, sub-10s target |
| IV. Security | ✅ Pass | Keys stored with 0600 permissions, no logging of secrets |
| V. User Privacy | ✅ Pass | Only collects necessary credentials, user controls data |

| Gate | Requirement | Status |
|------|-------------|--------|
| Lint & Format | Zero warnings/errors | Will verify |
| Type Check | Full type coverage | Go is statically typed |
| Unit Tests | All pass | Will add tests for new functionality |
| BDD Scenarios | All acceptance tests pass | Will implement |
| Performance | No regressions > 10% | N/A (init is fast) |
| Security Scan | No critical/high vulnerabilities | Keys stored securely |
| Code Review | At least one approval | Required before merge |

## Project Structure

### Documentation (this feature)

```text
specs/006-opencode-default-agent/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (from /speckit.tasks)
```

### Source Code (repository root)

```text
internal/
├── cli/
│   ├── init.go          # MODIFY: Simplify to 2 prompts, remove agent selection
│   ├── init_test.go     # MODIFY: Update tests for new flow
│   └── start.go         # MODIFY: Add OpenCode auth file creation
├── config/
│   ├── config.go        # MODIFY: New schema (remove default_agent, agent_api_keys)
│   ├── writer.go        # No changes needed (already handles 0600)
│   └── config_test.go   # MODIFY: Update for new schema
├── session/
│   ├── types.go         # MODIFY: Remove Agent field from Session
│   └── store.go         # No changes needed
├── sprites/
│   └── client.go        # No changes needed (ExecCommand already exists)
└── ui/
    └── prompt.go        # No changes needed
```

**Structure Decision**: Single CLI application with existing directory structure. Changes are localized to config schema, init command, and start command provisioning.

## Complexity Tracking

No constitution violations requiring justification. All changes follow existing patterns.

## Phase 0 Output

See [research.md](./research.md) for:
- OpenCode authentication method (file-based)
- Configuration schema migration strategy
- Secure key storage approach
- OpenCode installation in sandbox
- Session type simplification

## Phase 1 Output

See:
- [data-model.md](./data-model.md) - Entity schemas, validation rules, state transitions
- [quickstart.md](./quickstart.md) - Implementation guide with code snippets

## Constitution Check (Post-Design)

*Re-evaluation after Phase 1 design completion.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Code Quality | ✅ Pass | Follows existing patterns, removes unused code (agent types) |
| II. Behavior Driven Development | ✅ Pass | All acceptance scenarios testable, test updates planned |
| III. Performance | ✅ Pass | No new network calls in init, auth file creation is fast |
| IV. Security | ✅ Pass | Keys stored with 0600 permissions, no secrets in logs |
| V. User Privacy | ✅ Pass | Data minimization (2 keys vs 3+), user-initiated only |

**Design Compliance Summary**:
- No new dependencies introduced
- Breaking change to config schema is intentional and documented
- Migration path preserves existing Sprites tokens
- Graceful degradation if OpenCode auth fails in sandbox

## Next Steps

Run `/speckit.tasks` to generate the task breakdown for implementation.
