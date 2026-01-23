# Tasks: Human-Readable Sandbox Names

**Input**: Design documents from `/specs/003-human-readable-names/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Unit tests included as this is a Go project with existing test infrastructure.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Project structure**: `internal/` for packages, `cmd/` for main entry point
- Go standard testing in `*_test.go` files alongside source

---

## Phase 1: Setup

**Purpose**: No new project setup needed - modifying existing codebase

- [x] T001 Create feature branch `003-human-readable-names` from main (if not already created)
- [x] T002 Verify existing tests pass with `go test ./...` before making changes

---

## Phase 2: Foundational (Name Pool Infrastructure)

**Purpose**: Core name generation infrastructure that ALL user stories depend on

**⚠️ CRITICAL**: User story implementation cannot begin until name pool and case-insensitive lookup are in place

- [x] T003 Create name pool with 250 curated human first names in `internal/session/names.go`
- [x] T004 Implement `GetRandomName(usedNames []string) (string, error)` function in `internal/session/names.go`
- [x] T005 Add `NormalizeName(name string) string` helper function in `internal/session/store.go`
- [x] T006 Add `GetUsedNames() ([]string, error)` method to Store in `internal/session/store.go`
- [x] T007 [P] Create unit tests for name pool functions in `internal/session/names_test.go`
- [x] T008 [P] Create unit tests for NormalizeName and GetUsedNames in `internal/session/store_test.go`

**Checkpoint**: Foundation ready - name pool exists and can be queried for available names

---

## Phase 3: User Story 1 - Easy Sandbox Identification (Priority: P1) 🎯 MVP

**Goal**: Sandboxes receive human first names instead of hex IDs when created

**Independent Test**: Run `sandctl start --prompt "test"` and verify the returned name is a human first name with no numeric suffix (e.g., "alice", not "sandctl-a1b2c3d4")

### Tests for User Story 1

- [x] T009 [P] [US1] Update `TestGenerateID` in `internal/session/id_test.go` to expect human names matching `^[a-z]{2,15}$`
- [x] T010 [P] [US1] Update `TestValidateID` in `internal/session/id_test.go` to validate human name format

### Implementation for User Story 1

- [x] T011 [US1] Update `GenerateID()` in `internal/session/id.go` to accept `usedNames []string` parameter
- [x] T012 [US1] Replace hex generation with call to `GetRandomName(usedNames)` in `internal/session/id.go`
- [x] T013 [US1] Update `idPattern` regex from `^sandctl-[a-z0-9]{8}$` to `^[a-z]{2,15}$` in `internal/session/id.go`
- [x] T014 [US1] Update `ValidateID()` to use new pattern in `internal/session/id.go`
- [x] T015 [US1] Update `runStart()` in `internal/cli/start.go` to get used names from store before calling GenerateID
- [x] T016 [US1] Update success message in `internal/cli/start.go` to display human name

**Checkpoint**: `sandctl start` assigns human names. User Story 1 is independently testable.

---

## Phase 4: User Story 2 - Name Collision Handling (Priority: P2)

**Goal**: System automatically selects different name when collision would occur

**Independent Test**: Create multiple sandboxes rapidly and verify each receives a unique human name

### Tests for User Story 2

- [x] T017 [P] [US2] Add collision retry test in `internal/session/names_test.go` - verify retry when name is in use
- [x] T018 [P] [US2] Add exhaustion test in `internal/session/names_test.go` - verify error when all names used

### Implementation for User Story 2

- [x] T019 [US2] Implement retry logic (up to 10 attempts) in `GetRandomName()` in `internal/session/names.go`
- [x] T020 [US2] Return clear error "No available names. Please destroy unused sandboxes" when pool exhausted in `internal/session/names.go`
- [x] T021 [US2] Add duplicate check in `Store.Add()` that uses normalized names in `internal/session/store.go`

**Checkpoint**: Creating multiple sandboxes never produces duplicates. User Story 2 is independently testable.

---

## Phase 5: User Story 3 - Name Persistence Across Commands (Priority: P3)

**Goal**: Human names work consistently with case-insensitive matching in all commands

**Independent Test**: Create sandbox "alice", then run `sandctl exec Alice` and `sandctl destroy ALICE` - both should work

### Tests for User Story 3

- [x] T022 [P] [US3] Add case-insensitive lookup tests in `internal/session/store_test.go` for Get, Update, Remove
- [x] T023 [P] [US3] Add test that "Alice", "alice", "ALICE" all resolve to same session

### Implementation for User Story 3

- [x] T024 [US3] Update `Store.Get()` to normalize input name before lookup in `internal/session/store.go`
- [x] T025 [US3] Update `Store.Update()` to normalize input name in `internal/session/store.go`
- [x] T026 [US3] Update `Store.Remove()` to normalize input name in `internal/session/store.go`
- [x] T027 [US3] Update `Store.Add()` to normalize session ID before storage in `internal/session/store.go`
- [x] T028 [US3] Update `runDestroy()` in `internal/cli/destroy.go` to accept any-case input
- [x] T029 [US3] Update `runExec()` in `internal/cli/exec.go` to accept any-case input

**Checkpoint**: All commands work with any case. User Story 3 is independently testable.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final cleanup and validation

- [x] T030 Run full test suite with `go test ./...` and fix any failures
- [x] T031 Run `go fmt ./...` to ensure code formatting
- [x] T032 Run `golangci-lint run` and address any warnings (skipped - not installed)
- [ ] T033 Validate all quickstart.md scenarios work end-to-end (requires manual testing with Fly.io)
- [x] T034 Remove any dead code or unused constants (old IDPrefix, IDRandomLength if unused)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - verify baseline
- **Foundational (Phase 2)**: Depends on Setup - BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational completion
- **User Story 2 (Phase 4)**: Depends on User Story 1 (uses same generation path)
- **User Story 3 (Phase 5)**: Can run in parallel with US2 after US1 complete
- **Polish (Phase 6)**: Depends on all user stories complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Foundational - Can start immediately after Phase 2
- **User Story 2 (P2)**: Depends on US1 - Builds on name generation from US1
- **User Story 3 (P3)**: Depends on US1 - Can run parallel with US2 if needed

### Within Each Phase

- Tests should be written before implementation (verify they fail first)
- Foundation tasks must complete before user story work
- Store changes (T024-T027) can be done in parallel within US3

### Parallel Opportunities

**Phase 2 (Foundational)**:
- T007 and T008 can run in parallel (different test files)

**Phase 3 (User Story 1)**:
- T009 and T010 can run in parallel (same file but independent tests)

**Phase 4 (User Story 2)**:
- T017 and T018 can run in parallel (independent test scenarios)

**Phase 5 (User Story 3)**:
- T022 and T023 can run in parallel (independent tests)
- T024, T025, T026, T027 involve same file - must be sequential

---

## Parallel Example: Phase 2 Foundation

```bash
# Launch foundation tests in parallel:
Task: "Create unit tests for name pool functions in internal/session/names_test.go"
Task: "Create unit tests for NormalizeName and GetUsedNames in internal/session/store_test.go"
```

## Parallel Example: User Story 3

```bash
# Launch US3 tests in parallel:
Task: "Add case-insensitive lookup tests in internal/session/store_test.go"
Task: "Add test that Alice/alice/ALICE all resolve to same session"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (verify tests pass)
2. Complete Phase 2: Foundational (name pool + helpers)
3. Complete Phase 3: User Story 1 (name generation)
4. **STOP and VALIDATE**: `sandctl start` returns human names
5. Deploy/demo - basic functionality complete

### Incremental Delivery

1. Setup + Foundational → Infrastructure ready
2. Add User Story 1 → Human names assigned → Demo MVP
3. Add User Story 2 → Collision handling → Deploy
4. Add User Story 3 → Case-insensitive commands → Deploy
5. Polish → Production ready

### Single Developer Path

Follow phases sequentially: 1 → 2 → 3 → 4 → 5 → 6

---

## Notes

- [P] tasks = different files, no dependencies, can run concurrently
- [Story] label maps task to specific user story for traceability
- Go standard: tests live in `*_test.go` alongside source files
- Name pool of 250 names is embedded in source (no external file)
- Validation pattern: `^[a-z]{2,15}$` (2-15 lowercase letters only)
- All names stored lowercase, user input normalized before lookup
