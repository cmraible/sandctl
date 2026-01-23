# Research: Code Quality Hooks

**Feature**: 005-code-quality-hooks
**Date**: 2026-01-22

## Research Questions

1. How to efficiently check only staged Go files in pre-commit hooks?
2. What is the best approach for golangci-lint CI integration?
3. What hook installation pattern works best for Go projects?

---

## 1. Checking Only Staged Files

### Context
Pre-commit hooks need to be fast. Running linters on the entire codebase is slow and can frustrate developers, especially when they've only changed one file.

### Decision
Use `git diff --cached --name-only --diff-filter=ACM` to get staged Go files, then run checks only on those files.

### Rationale
- Running checks on the entire codebase is slow (~5-10s for small projects, much longer for large ones)
- Developers expect near-instant feedback on their changes
- Checking only staged files provides fast feedback on actual changes
- The `--diff-filter=ACM` flag filters for Added, Copied, and Modified files (excludes deleted files)

### Alternatives Considered

| Alternative | Pros | Cons | Decision |
|-------------|------|------|----------|
| `lint-staged` (Node.js) | Popular, well-tested | Adds Node.js dependency to Go project | Rejected |
| Full codebase check | Catches all issues | Too slow for pre-commit | Rejected |
| No staged file filtering | Simpler script | Poor developer experience | Rejected |

### Implementation Notes
```bash
# Get staged Go files
STAGED_GO_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep '\.go$')

# Exit early if no Go files
if [ -z "$STAGED_GO_FILES" ]; then
    exit 0
fi

# Run checks on specific files
gofmt -l $STAGED_GO_FILES
golangci-lint run $STAGED_GO_FILES
```

---

## 2. golangci-lint CI Integration

### Context
CI needs to run the same quality checks as local hooks, with good caching for performance and clear error reporting.

### Decision
Use the official `golangci/golangci-lint-action` GitHub Action with caching enabled.

### Rationale
- Official action maintained by golangci-lint team
- Automatic caching of lint results between runs
- PR annotations showing exactly where issues are
- Handles installation automatically
- Respects existing `.golangci.yml` configuration

### Alternatives Considered

| Alternative | Pros | Cons | Decision |
|-------------|------|------|----------|
| Manual installation via `go install` | Full control | More verbose YAML, manual caching | Rejected |
| Running via Makefile | Consistent with local | Loses PR annotations, manual caching | Rejected |
| reviewdog integration | Good PR comments | Additional complexity, another tool | Rejected |

### Implementation Notes
```yaml
- name: Run golangci-lint
  uses: golangci/golangci-lint-action@v4
  with:
    version: latest
    # Uses .golangci.yml automatically
```

---

## 3. Hook Installation Pattern

### Context
Developers need a simple way to install hooks. The solution must be version-controlled, work across platforms (macOS/Linux), and not require external tools.

### Decision
Use `.githooks/` directory with an installation script that sets `git config core.hooksPath .githooks`.

### Rationale
- Hooks are version-controlled alongside the code
- Single command installation
- Works with git 2.9+ (released 2016)
- No external dependencies (Python, Node.js, etc.)
- Automatic updates when pulling new hook versions

### Alternatives Considered

| Alternative | Pros | Cons | Decision |
|-------------|------|------|----------|
| Symlink to `.git/hooks/` | Works on older git | More complex setup, symlink issues on Windows | Rejected |
| pre-commit framework | Very popular, many hooks | Adds Python dependency | Rejected |
| Husky (Node.js) | Popular in JS ecosystem | Adds Node.js dependency | Rejected |
| lefthook (Go) | Native Go tool | Additional binary to install | Considered but unnecessary |

### Implementation Notes
```bash
#!/bin/bash
# scripts/install-hooks.sh

# Verify we're in repo root
if [ ! -d ".git" ]; then
    echo "Error: Run from repository root"
    exit 1
fi

# Configure git to use our hooks
git config core.hooksPath .githooks

echo "Git hooks installed successfully"
```

---

## Existing Project Context

### Current Tooling
- **Makefile**: Has `lint` (golangci-lint) and `fmt` (gofmt/goimports) targets
- **.golangci.yml**: Comprehensive configuration with 13 linters enabled
- **CI workflow**: Tests only, no linting currently

### Linters Already Configured
From `.golangci.yml`:
- errcheck, gosimple, govet, ineffassign, staticcheck, unused (standard)
- gofmt, goimports (formatting)
- misspell, unconvert, unparam (code quality)
- gocritic, revive (additional checks)
- gosec (security)

### No Changes Needed
The existing `.golangci.yml` is well-configured. The feature only needs to:
1. Add pre-commit hook that runs these checks
2. Add CI job that runs these checks
3. Add installation script

---

## Summary

| Decision | Choice | Key Reason |
|----------|--------|------------|
| Staged file checking | git diff + filter | Fast feedback, no dependencies |
| CI integration | golangci-lint-action | Official, caching, PR annotations |
| Hook installation | core.hooksPath | Version-controlled, single command, no deps |
