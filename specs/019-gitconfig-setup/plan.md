# Implementation Plan: Git Config Setup

**Branch**: `019-gitconfig-setup` | **Date**: 2026-01-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/019-gitconfig-setup/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

During `sandctl init`, prompt users to configure Git in the VM so that commits made by the agent are properly attributed. Support three methods: (1) transfer user's existing ~/.gitconfig (default when available), (2) specify a custom config file path, or (3) create new config by prompting for name/email. Skip transfer if VM already has .gitconfig. Implementation uses SSH to transfer files and set proper permissions (0600) on the VM.

## Technical Context

**Language/Version**: Go 1.24
**Primary Dependencies**: github.com/spf13/cobra v1.9.1 (CLI), golang.org/x/crypto/ssh (SSH client), gopkg.in/yaml.v3 (config), golang.org/x/term (terminal detection)
**Storage**: YAML config file at ~/.sandctl/config, JSON sessions file at ~/.sandctl/sessions.json
**Testing**: Go standard testing framework (`testing` package), E2E test suite (008-e2e-test-suite)
**Target Platform**: CLI tool for macOS/Linux (darwin/linux)
**Project Type**: Single project (CLI application)
**Performance Goals**: User interaction completion in <30 seconds for default option (SC-001), feedback on invalid input within 2 seconds (SC-003)
**Constraints**: Must handle file permission errors gracefully, support standard shell expansion (~, relative paths), maintain 0600 permissions on .gitconfig in VM
**Scale/Scope**: Single-user CLI tool, processes single .gitconfig file (<1MB typical), three configuration paths (default/custom/create new)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance Status | Notes |
|-----------|------------------|-------|
| **I. Code Quality** | ✅ PASS | Standard Go conventions, clear module boundaries, type-safe implementation |
| **II. Performance** | ✅ PASS | Measurable goals defined (SC-001: <30s, SC-003: <2s feedback), baseline testing via E2E suite |
| **III. Security** | ⚠️ REVIEW | File permission validation required (0600 enforcement), path traversal prevention needed, input sanitization for file paths, SSH transfer security relies on existing SSH implementation |
| **IV. User Privacy** | ✅ PASS | .gitconfig contains user PII (name/email) but is user-controlled data, no collection beyond what user explicitly provides, transparent about what's transferred |
| **V. E2E Testing** | ✅ PASS | Tests must invoke `sandctl init` as user would, verify behavior through CLI output and VM state (via SSH commands), no internal API coupling |

**Security Requirements (Principle III)**:
- Validate file paths before reading (prevent directory traversal)
- Check file permissions before presenting default option
- Sanitize all user input (file paths, email addresses)
- Set restrictive permissions (0600) on transferred .gitconfig
- Handle symlinks securely (resolve and validate targets)
- Fail safely on permission errors (silent fallback for unreadable ~/.gitconfig per FR-007)

**Action Required**: Phase 0 research must address secure file handling patterns in Go and SSH file transfer best practices.

---

## Constitution Check - Post Phase 1 Design

*Re-evaluated after completing Phase 1 design (research, data model, contracts, quickstart)*

| Principle | Compliance Status | Notes |
|-----------|------------------|-------|
| **I. Code Quality** | ✅ PASS | Design uses clear function signatures with single responsibilities, type-safe Go, no escape hatches needed, follows existing codebase patterns |
| **II. Performance** | ✅ PASS | Performance goals validated in research.md: file I/O <10ms, SSH transfer <100ms, email validation <1ms. All operations well under SC-001 (30s) and SC-003 (2s) requirements |
| **III. Security** | ✅ PASS | Security addressed comprehensively: (1) Path validation via filepath.Clean + os.Stat, (2) Base64 encoding prevents injection in SSH commands, (3) Permission checks for file readability, (4) 0600 permissions on VM .gitconfig, (5) Input sanitization for email/paths, (6) No secrets in code |
| **IV. User Privacy** | ✅ PASS | User data (name/email) only collected when user explicitly chooses CreateNew method, .gitconfig transfer is user-initiated, no telemetry, user can skip entirely |
| **V. E2E Testing** | ✅ PASS | E2E test plan in quickstart.md follows black-box testing via CLI invocation, no implementation coupling, tests verify user-visible behavior only |

**Security Implementation Verified** (Principle III follow-up):
- ✅ File path validation: `filepath.Clean()` + `os.Stat()` (research.md §1)
- ✅ SSH command injection prevention: Base64 encoding with single quotes (research.md §2)
- ✅ Permission handling: Explicit 0600 on VM .gitconfig (data-model.md, contracts)
- ✅ Input sanitization: Email validation, path expansion validation (data-model.md §3)
- ✅ Error handling: Silent fallback for unreadable ~/.gitconfig per FR-007 (data-model.md §Error Handling)

**Quality Gates Expected Results**:
| Gate | Status | Evidence |
|------|--------|----------|
| Lint & Format | Expected PASS | Standard Go patterns, no complex constructs |
| Type Check | Expected PASS | Full type safety, no interface{} or escape hatches |
| Unit Tests | Expected PASS | Test plan in quickstart.md Phase 1 & 2 |
| E2E Tests | Expected PASS | Test plan in quickstart.md Phase 5, follows Principle V |
| Performance | Expected PASS | Research validates all operations under thresholds |
| Security Scan | Expected PASS | No third-party deps, standard library only |
| Code Review | N/A | Required per constitution workflow |

**Conclusion**: All constitution principles satisfied. Ready for implementation (Phase 2 in tasks.md - to be generated by /speckit.tasks command).

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
cmd/
└── sandctl/           # Main entry point

internal/
├── cli/               # CLI command implementations (init command lives here)
├── config/            # Configuration management (~/.sandctl/config)
├── hetzner/           # Hetzner Cloud provider implementation
├── provider/          # VM provider interface
├── session/           # Session management (~/.sandctl/sessions.json)
├── sshagent/          # SSH agent integration
├── sshexec/           # SSH command execution
├── templateconfig/    # Template configuration management
└── ui/                # Terminal UI components (prompts, selections)

tests/
├── e2e/               # End-to-end tests (black-box CLI testing)
└── integration/       # Integration tests
```

**Structure Decision**: Standard Go project layout with single binary. This feature will primarily modify:
- `internal/cli/` - Add Git config prompts to init command
- `internal/sshexec/` - Use existing SSH utilities for file transfer
- `internal/ui/` - Use existing prompt/selection components
- `tests/e2e/` - Add E2E tests for Git config scenarios

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
