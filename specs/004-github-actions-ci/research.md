# Research: GitHub Actions CI/CD Pipeline

**Feature**: 004-github-actions-ci
**Date**: 2026-01-22

## Research Topics

### 1. GitHub Actions Workflow Triggers

**Question**: What events should trigger the CI workflow?

**Decision**: Use `pull_request` event targeting `main` branch with types:
- `opened` - When PR is first created
- `synchronize` - When new commits are pushed to PR
- `reopened` - When a closed PR is reopened

**Rationale**:
- These three events cover all scenarios where tests need to run
- `pull_request` event has read-only access by default (more secure than `pull_request_target`)
- Targeting `main` ensures tests run for all PRs that could affect the main branch

**Alternatives Considered**:
1. `push` event - Rejected: Runs on all pushes including direct to main
2. `pull_request_target` - Rejected: Has write access, not needed for testing
3. Include `edited` type - Rejected: Title/description changes don't need tests

### 2. Go Version Management

**Question**: How should the Go version be specified in the workflow?

**Decision**: Use `actions/setup-go@v5` with explicit Go version from `go.mod`:
```yaml
- uses: actions/setup-go@v5
  with:
    go-version-file: 'go.mod'
```

**Rationale**:
- Reads version from `go.mod`, single source of truth
- `setup-go@v5` handles caching automatically
- No manual version updates needed in workflow

**Alternatives Considered**:
1. Hardcode version `go-version: '1.22'` - Rejected: Requires manual sync with go.mod
2. Use `stable` - Rejected: Could cause unexpected behavior on Go updates
3. Matrix testing multiple versions - Rejected: Overkill for this project

### 3. Test Execution Command

**Question**: What test command should the workflow run?

**Decision**: Use `go test -v -race ./...`:
- `-v` for verbose output (better failure diagnostics)
- `-race` for race condition detection
- `./...` to run all tests in all packages

**Rationale**:
- `-race` catches concurrency bugs that unit tests might miss
- Verbose output helps developers diagnose failures from PR page
- `./...` is idiomatic Go pattern for "all packages"

**Alternatives Considered**:
1. Just `go test ./...` - Rejected: Missing race detection
2. Add `-cover` flag - Rejected: Constitution doesn't require coverage gates
3. Add `-timeout` flag - Rejected: GitHub Actions job timeout is sufficient

### 4. Workflow Job Timeout

**Question**: What timeout should be set for the test job?

**Decision**: Set job timeout to 10 minutes:
```yaml
timeout-minutes: 10
```

**Rationale**:
- Matches SC-005 success criteria ("within 10 minutes")
- Current tests complete in under 2 minutes
- Provides headroom for test suite growth
- Prevents runaway workflows from consuming all build minutes

**Alternatives Considered**:
1. 5 minutes - Rejected: Too tight, may fail as tests grow
2. 30 minutes - Rejected: Excessive, wastes resources on hangs
3. No timeout - Rejected: Risk of infinite loops consuming quota

### 5. Branch Protection Configuration

**Question**: How should branch protection be configured?

**Decision**: Configure via GitHub web UI with these settings:
- Require status checks before merging: ✅
- Require branches to be up to date: ❌ (optional)
- Status check: `test` (job name from workflow)

**Rationale**:
- Web UI is standard approach, well-documented
- Not requiring up-to-date branch avoids unnecessary rebuild cycles
- Single required check (`test`) is simple and sufficient

**Alternatives Considered**:
1. Use `gh api` to configure programmatically - Rejected: Requires admin token
2. Require up-to-date branches - Rejected: Causes merge queue issues
3. Multiple required checks - Rejected: Single workflow is sufficient

### 6. Runner Selection

**Question**: Which GitHub Actions runner should be used?

**Decision**: Use `ubuntu-latest`:
```yaml
runs-on: ubuntu-latest
```

**Rationale**:
- Standard for Go projects
- Well-maintained, regularly updated
- Fastest provisioning time
- sandctl targets Linux primarily

**Alternatives Considered**:
1. `ubuntu-22.04` - Rejected: Pinning prevents security updates
2. Matrix with multiple OS - Rejected: Project doesn't target Windows/macOS
3. Self-hosted runner - Rejected: Unnecessary complexity

## Summary of Decisions

| Topic | Decision |
|-------|----------|
| Trigger events | `pull_request: [opened, synchronize, reopened]` on `main` |
| Go version | Read from `go.mod` via `setup-go@v5` |
| Test command | `go test -v -race ./...` |
| Job timeout | 10 minutes |
| Branch protection | GitHub UI, require `test` status check |
| Runner | `ubuntu-latest` |
