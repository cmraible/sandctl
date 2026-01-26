# Implementation Plan: Repository Initialization Scripts

**Branch**: `014-repo-init-scripts` | **Date**: 2026-01-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/014-repo-init-scripts/spec.md`

## Summary

Add per-repository initialization scripts that execute automatically after cloning when running `sandctl new -R <repo>`. Users configure repos via `sandctl repo add/list/show/edit/remove` commands, with init scripts stored in `~/.sandctl/repos/<normalized-repo>/init.sh`. Scripts are transferred to the sprite and executed in the cloned repository directory before the console session starts.

## Technical Context

**Language/Version**: Go 1.24
**Primary Dependencies**: github.com/spf13/cobra v1.9.1 (CLI), gopkg.in/yaml.v3 v3.0.1, golang.org/x/term v0.30.0
**Storage**: Local filesystem at `~/.sandctl/repos/<repo>/init.sh` (0700 dir, 0755 script)
**Testing**: Go standard `testing` package, E2E tests via CLI invocation
**Target Platform**: macOS/Linux (CLI tool)
**Project Type**: Single CLI application
**Performance Goals**: Script configuration operations complete in <1 second; init script transfer and execution adds <30 seconds overhead (excluding script runtime)
**Constraints**: Init script timeout default 10 minutes; must not block on missing `$EDITOR`
**Scale/Scope**: Dozens of repo configurations per user (not thousands)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Code Quality | ✅ Pass | Will follow existing patterns in `internal/cli/`, use Go idioms |
| II. Performance | ✅ Pass | File I/O is minimal; timeout prevents runaway scripts |
| III. Security | ✅ Pass | Init scripts are user-authored (trusted); no secrets in scripts; 0700/0755 permissions |
| IV. User Privacy | ✅ Pass | No user data collection; scripts stored locally only |
| V. E2E Testing | ✅ Pass | Will test via CLI invocation, not internal APIs |

**No violations requiring justification.**

## Project Structure

### Documentation (this feature)

```text
specs/014-repo-init-scripts/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (CLI contract)
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
internal/
├── cli/
│   ├── repo.go          # NEW: repo subcommand group
│   ├── repo_add.go      # NEW: sandctl repo add
│   ├── repo_list.go     # NEW: sandctl repo list
│   ├── repo_show.go     # NEW: sandctl repo show
│   ├── repo_edit.go     # NEW: sandctl repo edit
│   ├── repo_remove.go   # NEW: sandctl repo remove
│   └── new.go           # MODIFY: integrate init script execution
├── repoconfig/          # NEW: repo configuration management
│   ├── store.go         # Repo config storage (CRUD operations)
│   ├── types.go         # RepoConfig struct
│   ├── normalize.go     # Repo name normalization
│   └── template.go      # Init script template
└── ...existing packages

tests/
└── e2e/
    └── repo_test.go     # NEW: E2E tests for repo commands
```

**Structure Decision**: Follows existing sandctl patterns. New `repoconfig` package mirrors `session` package structure. CLI commands follow `init.go`, `new.go` patterns.

## Complexity Tracking

> No constitution violations to justify.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A | N/A | N/A |

---

## Post-Design Constitution Re-Check

*Verified after Phase 1 design completion.*

| Principle | Status | Verification |
|-----------|--------|--------------|
| I. Code Quality | ✅ Pass | Design follows existing patterns; single-responsibility packages (`repoconfig/`); no escape hatches needed |
| II. Performance | ✅ Pass | All operations are local file I/O (<1 sec); script timeout prevents runaway execution |
| III. Security | ✅ Pass | 0700/0755 permissions prevent unauthorized access; base64 encoding for safe script transfer; no secrets in scripts |
| IV. User Privacy | ✅ Pass | All data stored locally; no telemetry; no external data transmission |
| V. E2E Testing | ✅ Pass | Test design uses CLI invocation only; no internal imports; black-box verification |

**All gates passed. Ready for task generation (`/speckit.tasks`).**
