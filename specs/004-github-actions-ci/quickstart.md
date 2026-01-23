# Quickstart: GitHub Actions CI/CD Pipeline

**Feature**: 004-github-actions-ci
**Date**: 2026-01-22

## Overview

This feature adds automated test execution on pull requests using GitHub Actions, with branch protection to require passing tests before merge.

**After Implementation**:
- Every PR targeting `main` automatically runs `go test -v -race ./...`
- PRs with failing tests cannot be merged
- Test results are visible directly in the PR interface

## Implementation Steps

### Step 1: Create Workflow File

Create `.github/workflows/ci.yml` with the following content:

```yaml
name: CI

on:
  pull_request:
    branches: [main]
    types: [opened, synchronize, reopened]

jobs:
  test:
    name: Test
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Go
        uses: actions/setup-go@v5
        with:
          go-version-file: 'go.mod'

      - name: Run tests
        run: go test -v -race ./...
```

### Step 2: Configure Branch Protection

After the workflow file is merged to `main`:

1. Go to **Settings** → **Branches** in the GitHub repository
2. Click **Add branch protection rule** (or edit existing rule for `main`)
3. Set **Branch name pattern**: `main`
4. Enable: **Require status checks to pass before merging**
5. Search for and select: `Test` (the job name from the workflow)
6. Click **Create** or **Save changes**

### Step 3: Verify Setup

1. Create a test PR with a passing test change
2. Verify the "Test" check runs automatically
3. Verify the check shows as required in the PR
4. Verify merge is allowed only after tests pass

## Testing Checklist

- [ ] PR creation triggers the CI workflow
- [ ] Pushing commits to PR re-triggers the workflow
- [ ] Failing tests show red X status on PR
- [ ] Passing tests show green checkmark on PR
- [ ] Merge button is blocked when tests fail
- [ ] Merge button is enabled when tests pass
- [ ] Test output is viewable in workflow logs
- [ ] Workflow completes within 10 minutes

## Example Workflow Run

```
Run go test -v -race ./...
=== RUN   TestGetRandomName_GivenEmptyUsedNames_ThenReturnsValidName
--- PASS: TestGetRandomName_GivenEmptyUsedNames_ThenReturnsValidName (0.00s)
=== RUN   TestGetRandomName_GivenUsedNames_ThenAvoidsCollision
--- PASS: TestGetRandomName_GivenUsedNames_ThenAvoidsCollision (0.00s)
...
PASS
ok      github.com/sandctl/sandctl/internal/session     0.523s
```

## Troubleshooting

### Workflow doesn't trigger
- Verify the workflow file is in `.github/workflows/`
- Verify the PR targets the `main` branch
- Check for YAML syntax errors in the workflow file

### Status check not appearing in branch protection
- The workflow must run at least once before it appears in the list
- Ensure the job name in the workflow matches what you're searching for

### Tests pass locally but fail in CI
- Check if tests depend on local environment variables
- Verify all dependencies are properly specified in `go.mod`
- Check for race conditions (CI uses `-race` flag)

## Files Changed

| File | Change |
|------|--------|
| `.github/workflows/ci.yml` | NEW: CI workflow for PR testing |
| GitHub Settings | CONFIGURE: Branch protection rule for `main` |
