# Tasks: Auto Console After New

**Input**: Design documents from `/specs/012-auto-console-after-new/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, contracts/cli-interface.md

**Tests**: E2E tests updated per constitution principle V (E2E Testing Philosophy). Existing tests must continue to pass.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: Go CLI application
- **Source**: `internal/cli/`
- **Tests**: `tests/e2e/`

---

## Phase 1: Setup

**Purpose**: Add the --no-console flag infrastructure

- [x] T001 Add `noConsole` flag variable to internal/cli/new.go
- [x] T002 Register --no-console flag in init() function in internal/cli/new.go

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before user story implementation

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Add golang.org/x/term import to internal/cli/new.go
- [x] T004 Verify runSpriteConsole() is accessible from new.go (same package, no changes needed)

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Seamless Session Creation and Connection (Priority: P1) 🎯 MVP

**Goal**: After provisioning, automatically start an interactive console session

**Independent Test**: Run `sandctl new` in an interactive terminal and verify automatic console connection after provisioning completes

### Implementation for User Story 1

- [x] T005 [US1] Add TTY detection check using term.IsTerminal() in internal/cli/new.go runNew()
- [x] T006 [US1] Add console connection logic after successful provisioning in internal/cli/new.go
- [x] T007 [US1] Update success message to show "Connecting to console..." before runSpriteConsole() in internal/cli/new.go
- [x] T008 [US1] Implement graceful error handling if console connection fails in internal/cli/new.go

**Checkpoint**: User Story 1 complete - auto-console works for interactive terminals

---

## Phase 4: User Story 2 - Skip Auto-Console Option (Priority: P2)

**Goal**: Provide --no-console flag and non-TTY detection for backward compatibility

**Independent Test**: Run `sandctl new --no-console` and verify command exits after session creation without starting console

### Implementation for User Story 2

- [x] T009 [US2] Implement --no-console flag check to skip console in internal/cli/new.go
- [x] T010 [US2] Ensure non-TTY detection works correctly (skip console when stdin is not terminal) in internal/cli/new.go
- [x] T011 [US2] Update command help text to document --no-console flag in internal/cli/new.go

**Checkpoint**: User Story 2 complete - backward compatibility maintained

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and E2E test updates

- [x] T012 Update E2E tests to use --no-console flag where needed in tests/e2e/cli_test.go
- [x] T013 Run golangci-lint on internal/cli/new.go
- [ ] T014 [P] Manual test: Run `sandctl new` interactively, verify auto-console
- [ ] T015 [P] Manual test: Run `sandctl new --no-console`, verify no console attempt
- [ ] T016 Run full E2E test suite with `go test -v -tags=e2e ./tests/e2e/...`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-4)**: All depend on Foundational phase completion
  - User stories proceed sequentially in priority order (P1 → P2)
- **Polish (Phase 5)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational - No dependencies on other stories
- **User Story 2 (P2)**: Can start after US1 - Adds opt-out mechanism

### Within Each User Story

- Core implementation before refinements
- Story complete before moving to next priority

### Parallel Opportunities

- T001 and T002 are sequential (same file, flag setup)
- T003 and T004 can run in parallel (different concerns)
- T014 and T015 can run in parallel (different test scenarios)

---

## Parallel Example: Phase 5 (Polish)

```bash
# These can run in parallel:
Task: "Manual test: Run sandctl new interactively"
Task: "Manual test: Run sandctl new --no-console"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T002)
2. Complete Phase 2: Foundational (T003-T004)
3. Complete Phase 3: User Story 1 (T005-T008)
4. **STOP and VALIDATE**: Test auto-console in interactive terminal
5. Deploy/demo if ready - basic auto-console works

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → **MVP Complete**
3. Add User Story 2 → Test independently → Backward compatibility complete
4. Polish → Production ready

### Single Developer Strategy

This is a small feature (~30 lines of code added) suitable for a single developer:

1. Complete all phases sequentially
2. Estimated: Single focused session of work
3. All code changes in one file (internal/cli/new.go) plus minor test updates

---

## Notes

- All implementation is in existing file: `internal/cli/new.go`
- Reuses `runSpriteConsole()` from `internal/cli/console.go` (same package)
- E2E tests in `tests/e2e/cli_test.go` need --no-console flag for existing tests
- No new dependencies required (golang.org/x/term already in go.mod)
- Pattern follows existing console command closely
