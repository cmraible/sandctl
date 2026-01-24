# Tasks: E2E Test Suite Improvement

**Input**: Design documents from `/specs/008-e2e-test-suite/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: This feature IS the test suite - all tasks are test-related.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **Test files**: `tests/e2e/`
- **Binary source**: `cmd/sandctl/main.go`

---

## Phase 1: Setup

**Purpose**: Prepare test infrastructure and remove old tests

- [x] T001 Delete existing API-direct test file `tests/e2e/e2e_test.go`
- [x] T002 Delete existing API-direct helper file `tests/e2e/helpers_test.go`
- [x] T003 Create new helper file with build tag and package declaration in `tests/e2e/helpers.go`

---

## Phase 2: Foundational (Test Infrastructure)

**Purpose**: Core helper functions that ALL e2e tests depend on

**⚠️ CRITICAL**: No test implementation can begin until this phase is complete

- [x] T004 Implement `buildBinary(t *testing.T) string` function that compiles sandctl to temp directory in `tests/e2e/helpers.go`
- [x] T005 Implement `TestMain(m *testing.M)` that builds binary once before all tests and cleans up after in `tests/e2e/cli_test.go`
- [x] T006 [P] Implement `runSandctl(t *testing.T, args ...string) (stdout, stderr string, exitCode int)` function in `tests/e2e/helpers.go`
- [x] T007 [P] Implement `runSandctlWithConfig(t *testing.T, configPath string, args ...string)` function in `tests/e2e/helpers.go`
- [x] T008 [P] Implement `requireToken(t *testing.T) string` function that gets SPRITES_API_TOKEN from env in `tests/e2e/helpers.go`
- [x] T009 [P] Implement `newTempConfig(t *testing.T, token string) string` function that creates config file in temp dir in `tests/e2e/helpers.go`
- [x] T010 [P] Implement `generateSessionName(t *testing.T) string` function with `e2e-test-` prefix in `tests/e2e/helpers.go`
- [x] T011 [P] Implement `registerSessionCleanup(t *testing.T, configPath, sessionName string)` function using t.Cleanup in `tests/e2e/helpers.go`

**Checkpoint**: Test infrastructure ready - e2e test implementation can now begin

---

## Phase 3: User Story 1 - Verify Each Command Works End-to-End (Priority: P1) 🎯 MVP

**Goal**: Create at least one e2e test for each sandctl command (init, start, list, exec, destroy, version)

**Independent Test**: Run `go test -v -tags=e2e -run "TestSandctl" ./tests/e2e/...` and verify all 6 commands are tested

### Implementation for User Story 1

- [x] T012 [US1] Create `TestSandctl` parent function with build tag in `tests/e2e/cli_test.go`
- [x] T013 [US1] Implement test `sandctl version > displays version information` in `tests/e2e/cli_test.go` (no API needed)
- [x] T014 [US1] Implement test `sandctl init > creates config file` in `tests/e2e/cli_test.go` (uses temp dir)
- [x] T015 [US1] Implement test `sandctl init > sets correct file permissions` in `tests/e2e/cli_test.go`
- [x] T016 [US1] Implement test `sandctl start > succeeds with --prompt flag` in `tests/e2e/cli_test.go` (provisions real session)
- [x] T017 [US1] Implement test `sandctl list > shows active sessions` in `tests/e2e/cli_test.go` (requires active session)
- [x] T018 [US1] Implement test `sandctl exec > runs command in session` in `tests/e2e/cli_test.go` (requires active session)
- [x] T019 [US1] Implement test `sandctl destroy > removes session` in `tests/e2e/cli_test.go` (cleanup test)

**Checkpoint**: All 6 sandctl commands have at least one e2e test (SC-001 satisfied)

---

## Phase 4: User Story 2 - Remove Non-CLI Tests (Priority: P2)

**Goal**: Ensure no tests in `tests/e2e/` call Sprites API directly

**Independent Test**: Verify all tests use `runSandctl` or `runSandctlWithConfig` helpers, no direct `sprites.Client` usage

### Implementation for User Story 2

- [x] T020 [US2] Verify no imports of `github.com/sandctl/sandctl/internal/sprites` in `tests/e2e/cli_test.go`
- [x] T021 [US2] Verify no imports of `github.com/sandctl/sandctl/internal/sprites` in `tests/e2e/helpers.go`
- [x] T022 [US2] Run `go build -tags=e2e ./tests/e2e/...` to confirm compilation succeeds

**Checkpoint**: Zero direct API calls in e2e tests (SC-002 satisfied)

---

## Phase 5: User Story 3 - Test Complete User Workflow (Priority: P2)

**Goal**: Single test that exercises the complete user journey: init → start → list → exec → destroy

**Independent Test**: Run `go test -v -tags=e2e -run "workflow" ./tests/e2e/...` and verify full lifecycle completes

### Implementation for User Story 3

- [x] T023 [US3] Implement test `workflow > complete session lifecycle` in `tests/e2e/cli_test.go`
- [x] T024 [US3] Add cleanup handling to workflow test ensuring session destroyed even on failure in `tests/e2e/cli_test.go`
- [x] T025 [US3] Add step-by-step logging to workflow test for clear diagnostic output in `tests/e2e/cli_test.go`

**Checkpoint**: Full workflow test passes end-to-end

---

## Phase 6: User Story 4 - Test Error Handling (Priority: P3)

**Goal**: Verify sandctl provides helpful error messages for invalid inputs

**Independent Test**: Run `go test -v -tags=e2e -run "fails" ./tests/e2e/...` and verify error tests pass

### Implementation for User Story 4

- [x] T026 [US4] Implement test `sandctl start > fails without config` in `tests/e2e/cli_test.go`
- [x] T027 [US4] Implement test `sandctl exec > fails for nonexistent session` in `tests/e2e/cli_test.go`
- [x] T028 [US4] Implement test `sandctl destroy > fails for nonexistent session` in `tests/e2e/cli_test.go`
- [x] T029 [US4] Implement test `sandctl start > requires the --prompt flag` in `tests/e2e/cli_test.go`

**Checkpoint**: Error handling tests pass, clear error messages verified

---

## Phase 7: Polish & Validation

**Purpose**: Final validation and documentation

- [x] T030 [P] Run full e2e test suite: `go test -v -tags=e2e ./tests/e2e/...`
- [x] T031 [P] Run linter: `golangci-lint run ./tests/e2e/...`
- [x] T032 Validate all test names follow `sandctl <command> > <description>` format (SC-006)
- [x] T033 [P] Verify quickstart.md instructions work correctly in `specs/008-e2e-test-suite/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - US1 (P1): Can start immediately after Phase 2
  - US2 (P2): Can run in parallel with US1 (verification only)
  - US3 (P2): Depends on US1 tests being implemented (uses same session flow)
  - US4 (P3): Can run in parallel with US3
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Foundation only - MVP target
- **User Story 2 (P2)**: Can verify during/after US1
- **User Story 3 (P2)**: Benefits from US1 individual command tests
- **User Story 4 (P3)**: Independent of other stories

### Within Each User Story

- Helper functions before test functions
- Simpler tests (version) before complex tests (start/exec)
- Individual command tests before workflow test

### Parallel Opportunities

- T006, T007, T008, T009, T010, T011 can all run in parallel (different helper functions)
- T030, T031, T033 can run in parallel (different validation tasks)
- US1 tests are sequential (share session setup in some cases)
- US4 error tests can run in parallel (independent scenarios)

---

## Parallel Example: Foundational Phase

```bash
# Launch all independent helper functions together:
Task: "Implement runSandctl function in tests/e2e/helpers.go"
Task: "Implement runSandctlWithConfig function in tests/e2e/helpers.go"
Task: "Implement requireToken function in tests/e2e/helpers.go"
Task: "Implement newTempConfig function in tests/e2e/helpers.go"
Task: "Implement generateSessionName function in tests/e2e/helpers.go"
Task: "Implement registerSessionCleanup function in tests/e2e/helpers.go"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (delete old files)
2. Complete Phase 2: Foundational (helper functions)
3. Complete Phase 3: User Story 1 (6 command tests)
4. **STOP and VALIDATE**: `go test -v -tags=e2e ./tests/e2e/...`
5. SC-001 satisfied - all commands have tests

### Incremental Delivery

1. Setup + Foundational → Test infrastructure ready
2. Add US1 → All 6 commands tested → SC-001 ✓
3. Add US2 → Verify no direct API calls → SC-002 ✓
4. Add US3 → Full workflow test → Complete journey verified
5. Add US4 → Error handling → Production-ready test suite

### Task Count Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| Phase 1: Setup | 3 | Delete old files, create new |
| Phase 2: Foundational | 8 | Helper functions |
| Phase 3: US1 (P1) | 8 | Command tests |
| Phase 4: US2 (P2) | 3 | Verification |
| Phase 5: US3 (P2) | 3 | Workflow test |
| Phase 6: US4 (P3) | 4 | Error tests |
| Phase 7: Polish | 4 | Validation |
| **Total** | **33** | |

---

## Notes

- All tests use `t.Run("sandctl X > description", ...)` for human-readable names
- Tests requiring API access need SPRITES_API_TOKEN environment variable
- Version test (T013) can run without API token - useful for quick validation
- Session tests take ~2 minutes due to provisioning time
- Use `-timeout 10m` flag for CI runs
