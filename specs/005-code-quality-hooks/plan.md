# Implementation Plan: Code Quality Hooks

**Branch**: `005-code-quality-hooks` | **Date**: 2026-01-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-code-quality-hooks/spec.md`

## Summary

Add automated code quality enforcement through git pre-commit hooks and CI pipeline integration. The pre-commit hook will run formatting checks (gofmt/goimports), static analysis (go vet), and linting (golangci-lint) on staged Go files before each commit. CI will run the same checks on all PRs to enforce quality standards even when hooks are bypassed.

## Technical Context

**Language/Version**: Go 1.22
**Primary Dependencies**: golangci-lint (existing `.golangci.yml`), gofmt, goimports, go vet
**Storage**: N/A
**Testing**: go test (existing), manual verification of hooks
**Target Platform**: macOS, Linux (developer machines and GitHub Actions runners)
**Project Type**: Single CLI application
**Performance Goals**: Pre-commit checks complete within 30 seconds for typical commits
**Constraints**: Must work with existing project structure; hooks must be installable with single command
**Scale/Scope**: ~35 Go files currently; typical commits touch 1-10 files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Requirement | Status | Notes |
|-----------|-------------|--------|-------|
| I. Code Quality | Consistent Style - automated linting/formatting | ✅ PASS | This feature directly implements this requirement |
| I. Code Quality | No Dead Code | ✅ PASS | golangci-lint `unused` linter enforces this |
| II. BDD | Testable Scenarios | ✅ PASS | Acceptance scenarios defined in spec are testable |
| III. Performance | Measurable Goals | ✅ PASS | 30s hook completion, 2min CI completion defined |
| IV. Security | Secrets Management | ✅ PASS | No secrets involved; uses existing SPRITES_API_TOKEN in CI |
| V. User Privacy | Data Minimization | ✅ PASS | No user data collected |

**Quality Gates Alignment:**

| Gate | Implementation |
|------|----------------|
| Lint & Format | Pre-commit hook + CI job using golangci-lint |
| Type Check | Go compiler (implicit via `go build`) |
| Unit Tests | Existing CI job (no changes needed) |
| Security Scan | golangci-lint `gosec` linter already configured |

## Project Structure

### Documentation (this feature)

```text
specs/005-code-quality-hooks/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output
└── checklists/
    └── requirements.md  # Specification quality checklist
```

### Source Code (repository root)

```text
# Existing structure (unchanged)
cmd/sandctl/
internal/
tests/

# New files for this feature
scripts/
└── install-hooks.sh     # Hook installation script

.githooks/
└── pre-commit           # Pre-commit hook script

.github/workflows/
└── ci.yml               # Updated with lint job (existing file)
```

**Structure Decision**: Adding a `scripts/` directory for developer tooling and `.githooks/` for version-controlled hooks. This follows the convention of keeping hooks in the repository rather than requiring external tools like pre-commit framework.

## Complexity Tracking

No constitution violations requiring justification. Implementation is straightforward and aligns with existing tooling.

---

## Phase 0: Research

### Research Tasks

1. **Best practices for Go pre-commit hooks** - How to check only staged files efficiently
2. **golangci-lint CI integration** - GitHub Actions best practices and caching
3. **Hook installation patterns** - Git core.hooksPath vs symlink approach

### Findings

#### 1. Checking Only Staged Files

**Decision**: Use `git diff --cached --name-only --diff-filter=ACM` to get staged Go files, then run checks only on those files.

**Rationale**: Running checks on the entire codebase is slow and can block commits for issues in unrelated files. Checking only staged files provides fast feedback on the developer's actual changes.

**Alternatives considered**:
- `lint-staged` (Node.js tool): Rejected - adds Node.js dependency to a Go project
- Full codebase check: Rejected - too slow for pre-commit, appropriate only for CI

#### 2. golangci-lint in CI

**Decision**: Use the official `golangci/golangci-lint-action` GitHub Action with caching enabled.

**Rationale**: Official action handles installation, caching of lint results, and provides clean PR annotations. Caching speeds up subsequent runs significantly.

**Alternatives considered**:
- Manual golangci-lint installation: Rejected - more verbose, no automatic caching
- Running via Makefile: Rejected - loses PR annotations and caching benefits

#### 3. Hook Installation

**Decision**: Use `.githooks/` directory with an installation script that sets `git config core.hooksPath .githooks`.

**Rationale**:
- Keeps hooks version-controlled in the repository
- Single command installation (`./scripts/install-hooks.sh` or `make install-hooks`)
- Works across all git versions 2.9+
- No external dependencies

**Alternatives considered**:
- Symlink to `.git/hooks/`: Rejected - more complex, doesn't handle hook updates well
- pre-commit framework: Rejected - adds Python dependency, overkill for single hook
- Husky (Node.js): Rejected - adds Node.js dependency

---

## Phase 1: Design

### Components

#### 1. Pre-commit Hook Script (`.githooks/pre-commit`)

**Purpose**: Run quality checks on staged Go files before allowing commit.

**Behavior**:
1. Check if any Go files are staged
2. If no Go files staged, exit 0 (allow commit)
3. Run checks in order:
   - `gofmt -l` on staged files (formatting)
   - `go vet` on packages containing staged files
   - `golangci-lint run` on staged files
4. If any check fails, print error and exit 1 (block commit)
5. If all pass, exit 0 (allow commit)

**Error handling**:
- If `go` not found: Print error message with installation link
- If `golangci-lint` not found: Print error with installation instructions
- Each check failure shows specific files and issues

#### 2. Installation Script (`scripts/install-hooks.sh`)

**Purpose**: Install pre-commit hooks with a single command.

**Behavior**:
1. Verify running from repository root (check for `.git` directory)
2. Configure `git config core.hooksPath .githooks`
3. Print success message
4. Idempotent - safe to run multiple times

#### 3. CI Lint Job (`.github/workflows/ci.yml`)

**Purpose**: Enforce quality checks on all PRs regardless of local hook status.

**New job**: `lint`
- Runs on: `ubuntu-latest`
- Steps:
  1. Checkout code
  2. Setup Go (using `go-version-file: 'go.mod'`)
  3. Run golangci-lint via official action
  4. Run `gofmt -d` to check formatting (no write)

**Dependency**: Lint job should run in parallel with existing `test` job.

#### 4. Makefile Updates

Add targets:
- `install-hooks`: Runs installation script
- `check-fmt`: Checks formatting without writing (for CI)

### Integration Points

- **Existing CI workflow**: Add lint job in parallel with test job
- **Existing Makefile**: Add new targets, keep existing `lint` and `fmt` targets
- **Existing .golangci.yml**: No changes needed - already comprehensive

### Data Flow

```
Developer makes changes
        ↓
    git add <files>
        ↓
    git commit
        ↓
Pre-commit hook triggers
        ↓
┌───────────────────────────┐
│ 1. Get staged .go files   │
│ 2. Run gofmt -l           │
│ 3. Run go vet ./...       │
│ 4. Run golangci-lint      │
└───────────────────────────┘
        ↓
   All pass? ──No──→ Show errors, exit 1 (commit blocked)
        │
       Yes
        ↓
   Commit proceeds
        ↓
   Push to remote
        ↓
   PR created/updated
        ↓
CI lint job runs (same checks)
        ↓
   Pass/Fail reported on PR
```

---

## Quickstart

### For Developers

After cloning the repository:

```bash
# Install pre-commit hooks (one-time setup)
make install-hooks

# Or manually:
./scripts/install-hooks.sh
```

The hook will automatically run on every commit. To bypass in emergencies:

```bash
git commit --no-verify -m "emergency fix"
```

### Running Checks Manually

```bash
# Run all linters
make lint

# Check formatting (shows diff, doesn't modify)
make check-fmt

# Auto-fix formatting
make fmt
```

### CI Behavior

The CI pipeline automatically:
1. Runs linting on all PRs to `main`
2. Fails the build if any quality issues are found
3. Reports specific issues as PR annotations
