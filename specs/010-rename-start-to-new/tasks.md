# Tasks: Rename Start Command to New

**Input**: Design documents from `/specs/010-rename-start-to-new/`
**Prerequisites**: plan.md, spec.md, data-model.md, quickstart.md, research.md

**Tests**: E2E tests will be updated as part of implementation (existing test suite).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: File renaming and initial preparation

- [x] T001 Rename command file from internal/cli/start.go to internal/cli/new.go using git mv

---

## Phase 2: Foundational (Data Model Changes)

**Purpose**: Core data model updates that MUST be complete before command changes

**⚠️ CRITICAL**: Session data model must be updated before CLI command changes

- [x] T002 Remove Prompt field from Session struct in internal/session/types.go
- [x] T003 Update Session.Validate() method to remove prompt validation in internal/session/types.go
- [x] T004 [P] Update Session tests to remove prompt requirements in internal/session/types_test.go

**Checkpoint**: Data model ready - command implementation can now proceed

---

## Phase 3: User Story 1 - Create New Sandbox Session (Priority: P1) 🎯 MVP

**Goal**: Users can create a new sandbox session by running `sandctl new` with no required arguments

**Independent Test**: Run `sandctl new` and verify a new session is created and listed in `sandctl list`

### Implementation for User Story 1

- [x] T005 [US1] Update command definition: change Use from "start" to "new" in internal/cli/new.go
- [x] T006 [US1] Update command Short and Long descriptions in internal/cli/new.go
- [x] T007 [US1] Update command Example text to show `sandctl new` usage in internal/cli/new.go
- [x] T008 [US1] Remove startPrompt variable and --prompt flag registration in internal/cli/new.go
- [x] T009 [US1] Remove prompt validation from runNew (formerly runStart) function in internal/cli/new.go
- [x] T010 [US1] Remove "Starting agent" step from provisioning steps array in internal/cli/new.go
- [x] T011 [US1] Update Session creation to not include Prompt field in internal/cli/new.go
- [x] T012 [US1] Rename runStart function to runNew in internal/cli/new.go
- [x] T013 [US1] Update rootCmd.AddCommand to register newCmd instead of startCmd in internal/cli/new.go
- [x] T014 [US1] Remove startAgentInSprite function (no longer needed) in internal/cli/new.go

### E2E Test Updates for User Story 1

- [x] T015 [US1] Update testStartSucceeds to use "new" command instead of "start" in tests/e2e/cli_test.go
- [x] T016 [US1] Update testStartFailsWithoutConfig to test "new" command in tests/e2e/cli_test.go
- [x] T017 [US1] Remove testStartRequiresPrompt test (no longer applicable) in tests/e2e/cli_test.go
- [x] T018 [US1] Add new test that `sandctl start` returns unknown command error in tests/e2e/cli_test.go
- [x] T019 [US1] Update testWorkflowLifecycle to use "new" instead of "start" in tests/e2e/cli_test.go
- [x] T020 [US1] Update TestSandctl parent test function descriptions in tests/e2e/cli_test.go

**Checkpoint**: User Story 1 complete - `sandctl new` works without arguments, `sandctl start` fails

---

## Phase 4: User Story 2 - Create Session with Auto-Destroy Timeout (Priority: P2)

**Goal**: Users can create a session with `sandctl new --timeout 2h` for automatic resource cleanup

**Independent Test**: Run `sandctl new --timeout 1m` and verify session metadata includes timeout

### Implementation for User Story 2

- [x] T021 [US2] Verify --timeout flag is preserved in newCmd flag registration in internal/cli/new.go
- [x] T022 [US2] Verify timeout parsing and validation logic is unchanged in internal/cli/new.go
- [x] T023 [US2] Update command Example to include timeout example in internal/cli/new.go

### E2E Test Updates for User Story 2

- [x] T024 [US2] Verify existing timeout tests still pass with new command in tests/e2e/cli_test.go

**Checkpoint**: User Story 2 complete - timeout functionality preserved with new command

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Final cleanup and validation

- [x] T025 [P] Run `make lint` to verify code style compliance
- [x] T026 [P] Run `make test` to verify unit tests pass
- [ ] T027 Run `make test-e2e` to verify e2e tests pass (requires API tokens)
- [x] T028 Manual verification: run `sandctl new` and confirm session creation (verified via --help)
- [x] T029 Manual verification: run `sandctl start` and confirm "unknown command" error
- [x] T030 Manual verification: run `sandctl new --timeout 1h` and confirm timeout works (verified via --help)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup - BLOCKS command implementation
- **User Story 1 (Phase 3)**: Depends on Foundational completion
- **User Story 2 (Phase 4)**: Depends on User Story 1 completion (same file modifications)
- **Polish (Phase 5)**: Depends on all stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Core functionality - must complete first
- **User Story 2 (P2)**: Extends US1 with timeout - depends on US1 being complete

### Within Each Phase

- T002 and T003 modify same file - execute sequentially
- T005-T014 modify same file - execute sequentially within US1
- T015-T020 modify same file - execute sequentially within US1 tests
- T025 and T026 can run in parallel (different operations)

### Parallel Opportunities

- T004 (types_test.go) can run in parallel with T002-T003 after T002 completes
- T025 and T026 can run in parallel during Polish phase

---

## Parallel Example: Phase 2

```bash
# After T002 completes, these can run in parallel:
Task: "Update Session.Validate() method to remove prompt validation in internal/session/types.go"
Task: "Update Session tests to remove prompt requirements in internal/session/types_test.go"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (file rename)
2. Complete Phase 2: Foundational (data model)
3. Complete Phase 3: User Story 1 (command + tests)
4. **STOP and VALIDATE**: Test `sandctl new` works, `sandctl start` fails
5. Deploy/demo if ready

### Full Implementation

1. Complete Phases 1-3 (MVP)
2. Complete Phase 4: User Story 2 (timeout verification)
3. Complete Phase 5: Polish & validation
4. Ready for code review and merge

---

## Notes

- This is a refactoring task - existing functionality is being renamed/simplified
- Most tasks modify the same files sequentially (internal/cli/new.go, tests/e2e/cli_test.go)
- Parallel opportunities are limited due to file dependencies
- Backward compatibility is intentionally broken (per FR-013)
- Existing sessions.json files will continue to work (prompt field ignored)
