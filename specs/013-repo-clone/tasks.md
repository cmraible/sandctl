# Tasks: Repository Clone on Sprite Creation

**Input**: Design documents from `/specs/013-repo-clone/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

**Tests**: Unit tests for parser; E2E tests for CLI workflow (per constitution requirement)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Project type**: Single CLI project (Go)
- **Source**: `internal/` at repository root
- **Tests**: `tests/e2e/` for E2E tests; `*_test.go` files for unit tests

---

## Phase 1: Setup

**Purpose**: Create new package structure for repository parsing

- [x] T001 Create `internal/repo/` directory for repository parsing package
- [x] T002 [P] Create empty `internal/repo/parser.go` with package declaration

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: RepoSpec type and parser that ALL user stories depend on

**⚠️ CRITICAL**: User Story 1 requires the parser to be complete before implementation can proceed

- [x] T003 Implement RepoSpec struct with Owner, Name, CloneURL fields in `internal/repo/parser.go`
- [x] T004 Implement Parse function for shorthand format (owner/repo) in `internal/repo/parser.go`
- [x] T005 Extend Parse to handle full GitHub URLs (https://github.com/owner/repo) in `internal/repo/parser.go`
- [x] T006 Implement validation rules (owner: 1-39 chars, no leading/trailing hyphen; repo: 1-100 chars) in `internal/repo/parser.go`
- [x] T007 Implement TargetPath method returning `/home/sprite/{Name}` in `internal/repo/parser.go`
- [x] T008 [P] Write unit tests for Parse function covering all input formats in `internal/repo/parser_test.go`
- [x] T009 [P] Write unit tests for validation error cases in `internal/repo/parser_test.go`

**Checkpoint**: Parser is complete and tested - user story implementation can now begin

---

## Phase 3: User Story 1 - Clone GitHub Repository During Sprite Creation (Priority: P1) 🎯 MVP

**Goal**: Users can run `sandctl new -R owner/repo` and have the repository cloned to `/home/sprite/repo`

**Independent Test**: Run `sandctl new -R TryGhost/Ghost --no-console` and verify via `sandctl exec <session> -c "ls /home/sprite/Ghost"`

### Implementation for User Story 1

- [x] T010 [US1] Add `repoFlag` variable and `--repo`/`-R` flag to newCmd in `internal/cli/new.go`
- [x] T011 [US1] Import `repo` package and parse flag value at start of runNew in `internal/cli/new.go`
- [x] T012 [US1] Implement `cloneRepository` function using ExecCommand with `timeout 600 git clone` in `internal/cli/new.go`
- [x] T013 [US1] Add "Cloning repository" step to provisioning steps slice (conditionally, only if repo specified) in `internal/cli/new.go`
- [x] T014 [US1] Implement `runSpriteConsoleWithWorkdir` function accepting working directory parameter in `internal/cli/console.go`
- [x] T015 [US1] Modify console invocation in runNew to use cloned repo directory when specified in `internal/cli/new.go`
- [x] T016 [US1] Update newCmd.Example to show `-R` usage in `internal/cli/new.go`
- [x] T017 [US1] Add E2E test `testNewWithRepoFlag` verifying repository clone in `tests/e2e/cli_test.go`

**Checkpoint**: User Story 1 complete - can create sprite with repo clone and console starts in repo dir

---

## Phase 4: User Story 2 - Create Sprite Without Repository (Priority: P2)

**Goal**: Existing `sandctl new` behavior preserved when `--repo` flag not provided

**Independent Test**: Run `sandctl new --no-console` and verify existing tests still pass

### Implementation for User Story 2

- [x] T018 [US2] Verify clone step is NOT added when repoFlag is empty in `internal/cli/new.go`
- [x] T019 [US2] Verify console starts in default directory when no repo specified in `internal/cli/new.go`
- [ ] T020 [US2] Run existing E2E tests to confirm backward compatibility via `make test-e2e`
- [x] T021 [US2] Add explicit E2E test `testNewWithoutRepoFlag` confirming no clone occurs in `tests/e2e/cli_test.go`

**Checkpoint**: User Story 2 complete - backward compatibility verified

---

## Phase 5: User Story 3 - Handle Clone Failures Gracefully (Priority: P3)

**Goal**: Clear error messages for clone failures; sprite cleaned up on failure

**Independent Test**: Run `sandctl new -R invalid/nonexistent-repo-12345` and verify error message and cleanup

### Implementation for User Story 3

- [x] T022 [US3] Implement `parseGitError` function to detect "not found", "access denied", "network error", "timeout" patterns in `internal/cli/new.go`
- [x] T023 [US3] Wrap cloneRepository errors with user-friendly messages in `internal/cli/new.go`
- [x] T024 [US3] Verify cleanupFailedSession is called when clone fails (existing cleanup flow) in `internal/cli/new.go`
- [x] T025 [US3] Add E2E test `testNewWithInvalidRepo` verifying error message contains "not found" in `tests/e2e/cli_test.go`
- [x] T026 [US3] Add E2E test `testNewWithInvalidRepoFormat` verifying validation error in `tests/e2e/cli_test.go`

**Checkpoint**: User Story 3 complete - error handling robust and user-friendly

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and documentation

- [x] T027 [P] Run `make lint` and fix any linting issues
- [x] T028 [P] Run `make test` to verify all unit tests pass
- [ ] T029 Run `make test-e2e` to verify all E2E tests pass
- [ ] T030 [P] Validate quickstart.md examples work correctly
- [x] T031 Update CLAUDE.md if any new technologies were added

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup - BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational phase completion
- **User Story 2 (Phase 4)**: Depends on User Story 1 (uses same code paths)
- **User Story 3 (Phase 5)**: Depends on User Story 1 (extends error handling)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational - No dependencies on other stories
- **User Story 2 (P2)**: Depends on US1 (verifies default path still works after US1 changes)
- **User Story 3 (P3)**: Depends on US1 (adds error handling to clone logic from US1)

### Within Each Phase

- Tasks without [P] must run sequentially
- Tasks with [P] can run in parallel (different files)
- T003-T007 must be sequential (building on same file)
- T008-T009 can run in parallel after T003-T007

### Parallel Opportunities

**Phase 2 (after T007)**:
```
T008 (parser tests) || T009 (validation tests)
```

**Phase 3**:
```
T010 (flag) → T011 (parse) → T012 (clone) → T013 (step) → T014 (workdir) → T015 (console) → T016 (example) → T017 (e2e)
```
(Sequential due to same-file dependencies)

**Phase 6**:
```
T027 (lint) || T028 (unit tests) || T030 (quickstart)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (2 tasks)
2. Complete Phase 2: Foundational (7 tasks)
3. Complete Phase 3: User Story 1 (8 tasks)
4. **STOP and VALIDATE**: Test with `sandctl new -R TryGhost/Ghost`
5. Deploy/demo if ready - core feature works

### Incremental Delivery

1. Setup + Foundational → Parser ready
2. User Story 1 → Test clone flow → MVP complete
3. User Story 2 → Verify backward compat → Safe for existing users
4. User Story 3 → Error handling → Production ready
5. Polish → CI passes → Ready to merge

---

## Summary

| Metric | Count |
|--------|-------|
| Total tasks | 31 |
| Setup tasks | 2 |
| Foundational tasks | 7 |
| User Story 1 tasks | 8 |
| User Story 2 tasks | 4 |
| User Story 3 tasks | 5 |
| Polish tasks | 5 |
| Parallel opportunities | 3 groups |

**MVP Scope**: Phases 1-3 (User Story 1) = 17 tasks

**Files Modified**:
- `internal/cli/new.go` (primary changes)
- `internal/cli/console.go` (workdir support)
- `tests/e2e/cli_test.go` (new tests)

**Files Created**:
- `internal/repo/parser.go`
- `internal/repo/parser_test.go`
