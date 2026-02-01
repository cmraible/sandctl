# Implementation Plan: Sandbox Git Configuration

**Branch**: `019-sandbox-git-config` | **Date**: 2026-01-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/019-sandbox-git-config/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Enable AI agents running in sandboxes to commit, push, and create pull requests independently by:
1. Detecting and storing user's git configuration (name/email from `~/.gitconfig`) during `sandctl init`
2. Copying the user's `.gitconfig` file to sandboxes during cloud-init provisioning
3. Installing and authenticating GitHub CLI (`gh`) in sandboxes using an optional GitHub token

## Technical Context

**Language/Version**: Go 1.24.0
**Primary Dependencies**: github.com/spf13/cobra v1.9.1 (CLI), gopkg.in/yaml.v3 (config), golang.org/x/term (terminal), golang.org/x/crypto/ssh (SSH client)
**Storage**: YAML config file at `~/.sandctl/config` (0600 permissions), JSON session store at `~/.sandctl/sessions.json`
**Testing**: Go standard `testing` package, E2E tests with build tags (`go test -tags e2e`)
**Target Platform**: macOS/Linux CLI tool, Ubuntu 24.04 sandbox VMs
**Project Type**: Single CLI project
**Performance Goals**: N/A (CLI tool, not performance-critical)
**Constraints**: Config file must have 0600 permissions, secrets (tokens) must never appear in logs
**Scale/Scope**: Single-user CLI tool for developer sandboxes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Pre-design status**: All gates passed. No blockers identified.

**Post-design status**: All gates satisfied by design artifacts.

### I. Code Quality
- [x] **Readability**: Clear naming in data-model.md (`GitConfigPath`, `GitUserName`, `GitUserEmail`, `GitHubToken`)
- [x] **Single Responsibility**: Extends existing patterns - prompts in `init.go`, setup via SSH in `new.go`
- [x] **Type Safety**: Strongly typed Go structs with yaml tags defined in data-model.md
- [x] **No Dead Code**: Minimal additions to Config struct per data-model.md
- [x] **Consistent Style**: Design follows existing codebase patterns (will pass golangci-lint)

### II. Performance
- [x] **Measurable Goals**: N/A - CLI config tool, not performance-critical
- [x] **Baseline Testing**: N/A - no performance regression risk
- [x] **Resource Efficiency**: N/A - minimal resource usage
- [x] **Scalability Consideration**: N/A - single-user CLI tool

### III. Security
- [x] **Defense in Depth**: Per research.md, GitHub token stored in 0600 config AND passed via encrypted SSH to `gh auth login --with-token` via stdin
- [x] **Input Validation**: Email validation defined in data-model.md (must contain @ with non-empty parts)
- [x] **Secrets Management**: Per research.md, token passed via SSH stdin, never in cloud-init user-data or logs
- [x] **Dependency Hygiene**: No new Go dependencies; `gh` CLI installed from official GitHub apt repo per research.md
- [x] **Least Privilege**: Per quickstart.md, token needs only `repo` scope

### IV. User Privacy
- [x] **Data Minimization**: Only git name/email and optional GitHub token collected
- [x] **Transparency**: Clear prompts defined in cli-interface.md explain what is collected
- [x] **User Control**: All git/GitHub config is optional per cli-interface.md
- [x] **Retention Limits**: Data in local config only, user controls deletion
- [x] **No Surveillance**: No analytics or telemetry

### V. End-to-End Testing Philosophy
- [x] **User-Centric Invocation**: E2E test scenarios in cli-interface.md invoke `sandctl init` and `sandctl new`
- [x] **Black-Box Testing**: Tests verify `git log --format='%an <%ae>'` output, not internal state
- [x] **Implementation Independence**: Tests assert on command output, not config file structure
- [x] **Decoupling Enforcement**: Test scenarios use CLI commands only, no internal imports
- [x] **Behavioral Contracts**: Tests verify "agent can run git commit successfully" per cli-interface.md

## Project Structure

### Documentation (this feature)

```text
specs/019-sandbox-git-config/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
cmd/sandctl/
└── main.go              # CLI entry point (no changes needed)

internal/
├── cli/
│   ├── init.go          # MODIFY: Add git config and GitHub token prompts
│   └── new.go           # MINOR: Pass git config to cloud-init
├── config/
│   └── config.go        # MODIFY: Add GitConfig struct fields
└── hetzner/
    └── setup.go         # MODIFY: Extend CloudInitScript to copy gitconfig and setup gh

tests/
└── e2e/
    └── cli_test.go      # MODIFY: Add tests for git commit in sandbox
```

**Structure Decision**: Existing single Go project structure. This feature primarily modifies existing files (`init.go`, `config.go`, `setup.go`) with minimal new code. No new packages or structural changes required.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations identified. This feature:
- Adds configuration options to existing `init` command
- Extends existing cloud-init script
- No new architectural patterns or dependencies required
