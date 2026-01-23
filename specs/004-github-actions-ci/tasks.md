# Tasks: GitHub Actions CI/CD Pipeline

**Input**: Design documents from `/specs/004-github-actions-ci/`
**Prerequisites**: plan.md, spec.md, research.md, quickstart.md

**Tests**: No automated tests for this feature - validation is done by observing workflow behavior on a test PR.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Workflow files**: `.github/workflows/`
- **Configuration**: GitHub web UI (Settings → Branches)

---

## Phase 1: Setup

**Purpose**: Create necessary directory structure

- [x] T001 Create `.github/workflows/` directory if it doesn't exist

---

## Phase 2: Foundational (Workflow File)

**Purpose**: Core workflow file that enables ALL user stories

**⚠️ CRITICAL**: User story testing cannot begin until the workflow file exists and is merged to main

- [x] T002 Create CI workflow file at `.github/workflows/ci.yml` with PR triggers
- [x] T003 Configure workflow to use `actions/checkout@v4` for code checkout
- [x] T004 Configure workflow to use `actions/setup-go@v5` with `go-version-file: 'go.mod'`
- [x] T005 Configure test step to run `go test -v -race ./...`
- [x] T006 Set job timeout to 10 minutes in `.github/workflows/ci.yml`
- [x] T007 Verify workflow YAML syntax is valid with `yamllint` or online validator

**Checkpoint**: Workflow file is complete and ready for merge to main

---

## Phase 3: User Story 1 - Automated Test Validation on PRs (Priority: P1) 🎯 MVP

**Goal**: Tests run automatically when PRs are opened or updated

**Independent Test**: Open a PR targeting main and verify the "Test" workflow runs automatically within 60 seconds

### Implementation for User Story 1

- [ ] T008 [US1] Merge the workflow file to main branch via PR or direct commit
- [ ] T009 [US1] Create a test PR to verify workflow triggers on PR creation
- [ ] T010 [US1] Push a commit to the test PR to verify workflow triggers on synchronize
- [ ] T011 [US1] Verify test output is visible in the Actions tab with pass/fail status

**Checkpoint**: PRs automatically trigger test runs. User Story 1 is independently verifiable.

---

## Phase 4: User Story 2 - Merge Protection via Required Checks (Priority: P2)

**Goal**: PRs with failing tests cannot be merged to main

**Independent Test**: Attempt to merge a PR with failing tests and verify merge is blocked

### Implementation for User Story 2

- [ ] T012 [US2] Navigate to GitHub repository Settings → Branches
- [ ] T013 [US2] Add branch protection rule for `main` branch pattern
- [ ] T014 [US2] Enable "Require status checks to pass before merging"
- [ ] T015 [US2] Select "Test" as a required status check (the job name from workflow)
- [ ] T016 [US2] Save branch protection rule configuration
- [ ] T017 [US2] Create a PR with intentionally failing test to verify merge is blocked
- [ ] T018 [US2] Fix the failing test and verify merge becomes available

**Checkpoint**: Merge is blocked when tests fail. User Story 2 is independently verifiable.

---

## Phase 5: User Story 3 - Test Result Visibility (Priority: P3)

**Goal**: Developers can see detailed test results in the PR interface

**Independent Test**: View a PR with test failures and verify specific test names and error messages are visible

### Implementation for User Story 3

- [ ] T019 [US3] Verify clicking "Details" on the check shows full test output
- [ ] T020 [US3] Verify failed test names are visible in workflow logs
- [ ] T021 [US3] Verify error messages and stack traces are visible for failures
- [ ] T022 [US3] Verify passing test summary shows test count

**Checkpoint**: Developers can diagnose failures from PR page. User Story 3 is independently verifiable.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and documentation

- [ ] T023 Verify workflow completes within 10 minutes (per SC-005)
- [x] T024 Verify all tests pass with `go test -v -race ./...` locally before final validation (Note: pre-existing failure in sprites package)
- [ ] T025 Run through quickstart.md testing checklist to validate all scenarios
- [ ] T026 Clean up any test PRs created during validation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup - creates the workflow file
- **User Story 1 (Phase 3)**: Depends on Foundational - requires workflow merged to main
- **User Story 2 (Phase 4)**: Depends on User Story 1 - requires workflow to exist and run
- **User Story 3 (Phase 5)**: Depends on User Story 1 - requires workflow runs to inspect
- **Polish (Phase 6)**: Depends on all user stories complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Phase 2 workflow is merged
- **User Story 2 (P2)**: Can start after US1 workflow has run at least once (GitHub requires this to list the check)
- **User Story 3 (P3)**: Can run in parallel with US2 after US1 complete

### Sequential Execution Required

All tasks must be executed sequentially because:
1. Directory must exist before workflow file
2. Workflow file must be complete before merge
3. Workflow must be in main before PRs can trigger it
4. Branch protection can only reference checks that have run at least once

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (create directory)
2. Complete Phase 2: Foundational (create workflow file)
3. Complete Phase 3: User Story 1 (merge and verify triggers)
4. **STOP and VALIDATE**: PRs trigger automated tests
5. Deploy/demo - basic CI functionality complete

### Incremental Delivery

1. Setup + Foundational → Workflow file ready
2. Add User Story 1 → Tests run on PRs → Demo MVP
3. Add User Story 2 → Merge protection enabled → Production ready
4. Add User Story 3 → Verify visibility → Polish complete

### Important Notes

- **No parallel tasks**: This is a sequential configuration feature
- **GitHub UI tasks**: T012-T016 are manual steps in GitHub web interface
- **Test PRs**: T009-T011, T017-T018 require creating actual PRs for validation
- **Cleanup**: T026 should remove any test PRs created during validation

---

## Notes

- This feature has no automated tests - validation is observational
- Branch protection configuration (T012-T016) is done via GitHub web UI
- The workflow must run at least once before it appears in branch protection settings
- All tasks are sequential due to the configuration-based nature of this feature
- Keep test PRs minimal to avoid noise in repository history
