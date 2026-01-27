# Implementation Plan: Rename Repo Commands to Template

**Branch**: `018-rename-repo-to-template` | **Date**: 2026-01-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/018-rename-repo-to-template/spec.md`

## Summary

Rename the `sandctl repo` command group to `sandctl template` with simplified unique string names instead of the owner/repo format. This is a breaking change that removes all backward compatibility with the existing repo system. Templates will be stored at `~/.sandctl/templates/<normalized-name>/` and accessed via `-T/--template` flag on `sandctl new`. The implementation involves deleting the `internal/repo/` and `internal/repoconfig/` packages, creating a new `internal/templateconfig/` package, and updating all CLI commands.

## Technical Context

**Language/Version**: Go 1.24.0
**Primary Dependencies**: github.com/spf13/cobra v1.9.1 (CLI), gopkg.in/yaml.v3 (config), golang.org/x/term (terminal detection)
**Storage**: YAML files at `~/.sandctl/templates/<name>/config.yaml`, shell scripts at `~/.sandctl/templates/<name>/init.sh`
**Testing**: Go standard `testing` package, E2E tests via compiled binary execution
**Target Platform**: macOS, Linux (CLI tool)
**Project Type**: Single CLI application
**Performance Goals**: Template operations complete in <5 seconds (per SC-001)
**Constraints**: Must work offline for local template operations
**Scale/Scope**: Single user, dozens of templates maximum

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Code Quality | ✅ PASS | Removes dead code (repo parsing), maintains single responsibility, consistent style |
| II. Performance | ✅ PASS | <5 second target for template creation, no regression from current repo functionality |
| III. Security | ✅ PASS | File permissions maintained (0700 for scripts, 0600 for config), no secrets in code |
| IV. User Privacy | ✅ PASS | No user data collection, local storage only |
| V. E2E Testing | ✅ PASS | Tests invoke CLI exactly as user would, black-box approach |

**Gate Result**: PASS - No violations requiring justification.

## Project Structure

### Documentation (this feature)

```text
specs/018-rename-repo-to-template/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (N/A - CLI tool, no API contracts)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
cmd/sandctl/
└── main.go              # Entry point (no changes needed)

internal/
├── cli/
│   ├── root.go          # Root command - update to register template commands
│   ├── new.go           # MODIFY: Replace -R/--repo with -T/--template
│   ├── template.go      # NEW: Template parent command
│   ├── template_add.go  # NEW: Create template
│   ├── template_edit.go # NEW: Edit template in editor
│   ├── template_list.go # NEW: List all templates
│   ├── template_remove.go # NEW: Delete template with confirmation
│   ├── template_show.go # NEW: Display init script contents
│   ├── repo.go          # DELETE
│   ├── repo_add.go      # DELETE
│   ├── repo_edit.go     # DELETE
│   ├── repo_list.go     # DELETE
│   ├── repo_remove.go   # DELETE
│   └── repo_show.go     # DELETE
├── templateconfig/      # NEW: Template configuration storage
│   ├── store.go         # Template store (Add, Get, List, Remove, Update)
│   ├── types.go         # TemplateConfig struct
│   ├── normalize.go     # Name normalization (lowercase, special chars → hyphens)
│   └── template.go      # Init script template generator
├── repo/                # DELETE entire package
│   ├── parser.go        # DELETE
│   └── parser_test.go   # DELETE
├── repoconfig/          # DELETE entire package
│   ├── store.go         # DELETE
│   ├── types.go         # DELETE
│   ├── normalize.go     # DELETE
│   └── template.go      # DELETE
├── config/              # No changes
├── hetzner/             # No changes (CloudInitScriptWithRepo already deprecated)
├── session/             # No changes
└── ui/                  # No changes

tests/e2e/
├── cli_test.go          # MODIFY: Update repo-related tests
├── template_test.go     # NEW: Template command tests (replaces repo_test.go)
└── repo_test.go         # DELETE
```

**Structure Decision**: Single project structure maintained. Only internal packages are modified.

## Complexity Tracking

> No violations to justify - design maintains existing simplicity.

| Aspect | Current | New | Change |
|--------|---------|-----|--------|
| CLI packages | 17 files | 17 files | 6 deleted, 6 added (net zero) |
| Config packages | 2 packages | 1 package | repo + repoconfig → templateconfig |
| Command groups | 6 | 6 | repo → template |

## Post-Design Constitution Re-Check

*Re-evaluated after Phase 1 design completion.*

| Principle | Status | Design Evidence |
|-----------|--------|-----------------|
| I. Code Quality | ✅ PASS | Single responsibility maintained: `templateconfig/` package handles storage, `cli/` handles commands. No dead code—old repo packages deleted entirely. Naming is clear and consistent. |
| II. Performance | ✅ PASS | All operations are filesystem-based with <5 second target. No network calls for local template operations. No regression from current repo functionality. |
| III. Security | ✅ PASS | File permissions documented in data-model.md: config.yaml (0600), init.sh (0700). No secrets stored in code. Input validation via normalization. |
| IV. User Privacy | ✅ PASS | No telemetry, no external services. All data stored locally in `~/.sandctl/templates/`. User has full control via filesystem. |
| V. E2E Testing | ✅ PASS | E2E tests designed to invoke `sandctl template <cmd>` exactly as users would. Tests verify output and exit codes only, not internal state. No implementation coupling. |

**Post-Design Gate Result**: PASS - Design maintains full constitution compliance.

## Generated Artifacts

| Artifact | Path | Description |
|----------|------|-------------|
| Plan | `specs/018-rename-repo-to-template/plan.md` | This implementation plan |
| Research | `specs/018-rename-repo-to-template/research.md` | Technical decisions and alternatives |
| Data Model | `specs/018-rename-repo-to-template/data-model.md` | Entity definitions, storage schema, Go types |
| Quickstart | `specs/018-rename-repo-to-template/quickstart.md` | User-facing documentation for template commands |
| Contracts | N/A | Not applicable (CLI tool, no API contracts) |
