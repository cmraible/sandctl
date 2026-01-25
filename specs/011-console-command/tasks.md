# Tasks: Console Command

**Input**: Design documents from `/specs/011-console-command/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, contracts/cli-interface.md

**Tests**: E2E tests included per constitution principle V (E2E Testing Philosophy) and plan.md quality gates.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: Go CLI application
- **Source**: `internal/cli/`, `internal/sprites/`, `internal/ui/`
- **Tests**: `tests/e2e/`

---

## Phase 1: Setup

**Purpose**: Create the new command file and register it with the CLI

- [x] T001 Create console command file skeleton in internal/cli/console.go
- [x] T002 Register console command with root command in internal/cli/console.go init()

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core validation and infrastructure that MUST be complete before interactive session work

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Implement terminal detection check using term.IsTerminal() in internal/cli/console.go
- [x] T004 Implement session name normalization and validation in internal/cli/console.go
- [x] T005 Implement session lookup from local store in internal/cli/console.go
- [x] T006 Implement sprite state verification via API in internal/cli/console.go

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Quick Console Access (Priority: P1) 🎯 MVP

**Goal**: Developer can connect to a running sandbox session with an interactive terminal

**Independent Test**: Run `sandctl console <session-name>` against a running session and verify an interactive shell prompt appears that accepts and executes commands

### E2E Test for User Story 1

- [x] T007 [US1] Add E2E test for successful console connection in tests/e2e/cli_test.go

### Implementation for User Story 1

- [x] T008 [US1] Implement runConsole() main handler function in internal/cli/console.go
- [x] T009 [US1] Implement runInteractiveConsole() with WebSocket session setup in internal/cli/console.go
- [x] T010 [US1] Add terminal raw mode setup with defer restoration in internal/cli/console.go
- [x] T011 [US1] Add connection feedback messages ("Connecting...", "Connected. Press Ctrl+D to exit.") in internal/cli/console.go
- [x] T012 [US1] Implement signal handling for graceful exit (SIGINT, SIGTERM) in internal/cli/console.go

**Checkpoint**: User Story 1 complete - basic console access works

---

## Phase 4: User Story 2 - Handle Non-Running Sessions (Priority: P2)

**Goal**: Clear feedback when attempting to connect to sessions that are not running

**Independent Test**: Attempt `sandctl console <name>` against sessions in various non-running states and verify appropriate error messages

### E2E Test for User Story 2

- [x] T013 [US2] Add E2E test for session not found error in tests/e2e/cli_test.go

### Implementation for User Story 2

- [x] T014 [US2] Implement non-running session error handling with ui.FormatSessionNotRunning() in internal/cli/console.go
- [x] T015 [US2] Implement session not found error with exit code 4 in internal/cli/console.go
- [x] T016 [US2] Implement non-terminal stdin rejection with helpful message in internal/cli/console.go

**Checkpoint**: User Story 2 complete - error handling works

---

## Phase 5: User Story 3 - Seamless Terminal Experience (Priority: P2)

**Goal**: SSH-like terminal experience with proper resizing, signal handling, and clean exit

**Independent Test**: Resize terminal window during active console session and verify remote shell adapts

### Implementation for User Story 3

- [x] T017 [US3] Implement SIGWINCH handler for terminal resize in internal/cli/console.go
- [x] T018 [US3] Get initial terminal dimensions via term.GetSize() in internal/cli/console.go
- [x] T019 [US3] Implement graceful disconnection handling with error messages in internal/cli/console.go
- [x] T020 [US3] Ensure terminal state restoration on all exit paths (panic recovery) in internal/cli/console.go

**Checkpoint**: User Story 3 complete - full SSH-like experience

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and cleanup

- [x] T021 Run golangci-lint on internal/cli/console.go
- [x] T022 [P] Verify all exit codes match contracts/cli-interface.md
- [x] T023 [P] Manual test following quickstart.md scenarios
- [x] T024 Run full E2E test suite with `go test -v -tags=e2e ./tests/e2e/...`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion
  - User stories proceed sequentially in priority order (P1 → P2 → P2)
  - US2 and US3 are both P2 but can be done in either order
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational - No dependencies on other stories
- **User Story 2 (P2)**: Can start after US1 - Builds on error handling patterns
- **User Story 3 (P2)**: Can start after US1 - Enhances terminal experience

### Within Each User Story

- E2E test before implementation (TDD approach per constitution)
- Core implementation before refinements
- Story complete before moving to next priority

### Parallel Opportunities

- T001 and T002 are sequential (T002 depends on T001 for file existence)
- T003, T004, T005, T006 can be implemented sequentially (shared file, logical order)
- T022 and T023 can run in parallel (different validation approaches)

---

## Parallel Example: Phase 6 (Polish)

```bash
# These can run in parallel:
Task: "Verify all exit codes match contracts/cli-interface.md"
Task: "Manual test following quickstart.md scenarios"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T002)
2. Complete Phase 2: Foundational (T003-T006)
3. Complete Phase 3: User Story 1 (T007-T012)
4. **STOP and VALIDATE**: Test console access to running session
5. Deploy/demo if ready - basic SSH-like access works

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → **MVP Complete**
3. Add User Story 2 → Test independently → Error handling complete
4. Add User Story 3 → Test independently → Full terminal experience
5. Polish → Production ready

### Single Developer Strategy

This is a small feature (~150 lines of code) suitable for a single developer:

1. Complete all phases sequentially
2. Estimated: One focused session of work
3. All code in one file (internal/cli/console.go) plus test additions

---

## Notes

- All implementation is in a single new file: `internal/cli/console.go`
- E2E tests added to existing `tests/e2e/cli_test.go`
- Reuses existing infrastructure (no changes to sprites/, session/, or ui/ packages)
- Pattern follows existing `internal/cli/exec.go` closely
- No new dependencies required (all packages already in go.mod)
