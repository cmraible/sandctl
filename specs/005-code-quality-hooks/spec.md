# Feature Specification: Code Quality Hooks

**Feature Branch**: `005-code-quality-hooks`
**Created**: 2026-01-22
**Status**: Draft
**Input**: User description: "To enforce better code quality, we should create a git pre-commit hook that runs formatting, linting and typechecks. We should also run formatting checks, linting and typechecks in CI"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Developer Catches Issues Before Commit (Priority: P1)

As a developer working on the sandctl codebase, I want code quality checks to run automatically before I commit so that I catch formatting issues, linting errors, and problems early—before they reach the shared repository.

**Why this priority**: This is the core value proposition. Catching issues at commit time prevents problematic code from ever entering the repository and provides immediate feedback to developers while the changes are fresh in their minds.

**Independent Test**: Can be fully tested by making a commit with intentionally malformed Go code and verifying the commit is blocked with helpful error messages.

**Acceptance Scenarios**:

1. **Given** a developer has staged Go files with formatting issues, **When** they attempt to commit, **Then** the commit is blocked and they see a message indicating which files need formatting.

2. **Given** a developer has staged Go files with linting errors (e.g., unused variables, unreachable code), **When** they attempt to commit, **Then** the commit is blocked and they see specific error messages with file locations.

3. **Given** a developer has staged Go files with compilation errors, **When** they attempt to commit, **Then** the commit is blocked and they see the compilation error messages.

4. **Given** a developer has staged Go files that pass all quality checks, **When** they attempt to commit, **Then** the commit succeeds normally.

5. **Given** a developer has staged only non-Go files (e.g., markdown, yaml), **When** they attempt to commit, **Then** the commit proceeds without running Go-specific checks.

---

### User Story 2 - CI Validates Pull Requests (Priority: P2)

As a maintainer, I want the CI pipeline to validate that all code in pull requests passes formatting, linting, and compilation checks so that code reviews can focus on logic and design rather than style issues.

**Why this priority**: CI provides a safety net for cases where pre-commit hooks were bypassed or not installed, and ensures consistent enforcement across all contributors regardless of their local setup.

**Independent Test**: Can be fully tested by opening a PR with code that fails quality checks and verifying the CI check fails with clear error messages.

**Acceptance Scenarios**:

1. **Given** a pull request contains Go files with formatting issues, **When** the CI pipeline runs, **Then** the build fails and the PR shows a failed check with details about the formatting issues.

2. **Given** a pull request contains Go files with linting errors, **When** the CI pipeline runs, **Then** the build fails and the PR shows a failed check with specific linting error messages.

3. **Given** a pull request contains Go files that compile but have static analysis issues, **When** the CI pipeline runs, **Then** the build fails and the PR shows which issues were detected.

4. **Given** a pull request contains Go files that pass all quality checks, **When** the CI pipeline runs, **Then** the quality check job succeeds.

---

### User Story 3 - Easy Hook Installation (Priority: P3)

As a new contributor setting up the project locally, I want a simple way to install the pre-commit hooks so that I can start contributing with quality checks enabled from my first commit.

**Why this priority**: Reduces friction for new contributors and ensures they have the same quality tooling as existing team members without manual configuration.

**Independent Test**: Can be fully tested by cloning the repository fresh, running the installation command, and verifying hooks are active.

**Acceptance Scenarios**:

1. **Given** a developer has cloned the repository without hooks configured, **When** they run the hook installation command, **Then** the pre-commit hook is installed and active.

2. **Given** a developer already has the hooks installed, **When** they run the installation command again, **Then** the installation succeeds without error (idempotent).

3. **Given** a developer wants to temporarily bypass hooks, **When** they use git's `--no-verify` flag, **Then** the commit proceeds without running checks (escape hatch for emergencies).

---

### Edge Cases

- What happens when a developer commits from a system without Go installed? The hook should fail gracefully with a message indicating Go is required.
- What happens when linting tools are not installed? The hook should provide instructions for installing required tools.
- How does the system handle partial staging (some changes staged, some not)? The checks should only validate staged changes, not unstaged modifications.
- What happens on merge commits? Standard git behavior—hooks run on merge commits unless the merge is fast-forward.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a git pre-commit hook script that runs before each commit
- **FR-002**: Pre-commit hook MUST check Go code formatting using standard Go tools
- **FR-003**: Pre-commit hook MUST run static analysis to catch common errors
- **FR-004**: Pre-commit hook MUST run linting checks for code quality issues
- **FR-005**: Pre-commit hook MUST verify Go code compiles without errors
- **FR-006**: Pre-commit hook MUST only check staged Go files, not the entire codebase
- **FR-007**: Pre-commit hook MUST exit with non-zero status when any check fails, blocking the commit
- **FR-008**: Pre-commit hook MUST display clear error messages indicating which check failed and why
- **FR-009**: CI pipeline MUST include a job that runs formatting verification
- **FR-010**: CI pipeline MUST include linting checks matching pre-commit hook checks
- **FR-011**: CI pipeline MUST include static analysis checks
- **FR-012**: CI pipeline MUST fail the build when any quality check fails
- **FR-013**: System MUST provide a way for developers to install the pre-commit hook locally
- **FR-014**: Installation process MUST be idempotent (safe to run multiple times)
- **FR-015**: Pre-commit hook MUST complete checks within a reasonable time for typical commits

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Pre-commit hook runs all checks and completes within 30 seconds for commits touching up to 20 Go files
- **SC-002**: 100% of commits to main branch pass all quality checks (enforced by CI)
- **SC-003**: Developers can install pre-commit hooks with a single command
- **SC-004**: CI quality checks complete within 2 minutes for typical pull requests
- **SC-005**: Error messages from failed checks clearly identify the file, line number, and issue
- **SC-006**: Zero formatting or linting issues reach the main branch after implementation

## Assumptions

- Developers have Go 1.22+ installed locally (consistent with project requirements)
- The project will use standard Go tooling (gofmt, go vet) supplemented by golangci-lint for comprehensive linting
- Git version 2.9+ is available (supports core.hooksPath for easier hook management)
- Developers are familiar with git hooks and understand they can bypass with --no-verify in emergencies
- The existing CI workflow structure will be extended rather than replaced
