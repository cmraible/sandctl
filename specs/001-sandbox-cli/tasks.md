# Tasks: Sandbox CLI

**Input**: Design documents from `/specs/001-sandbox-cli/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not explicitly requested in spec. Tests omitted but can be added on request.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

Based on plan.md structure:
- CLI entry point: `cmd/sandctl/`
- Internal packages: `internal/cli/`, `internal/config/`, `internal/sprites/`, `internal/session/`, `internal/ui/`
- Tests: `tests/unit/`, `tests/integration/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Create project directory structure per plan.md in cmd/, internal/, tests/
- [x] T002 Initialize Go module with `go mod init` and add dependencies (cobra, viper) in go.mod
- [x] T003 [P] Configure golangci-lint with .golangci.yml at repository root
- [x] T004 [P] Create Makefile with build, test, lint, and install targets at repository root

**Checkpoint**: Project structure ready for development

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Implement Config struct and loader in internal/config/config.go (load ~/.sandctl/config, validate permissions)
- [x] T006 [P] Implement Session and related types (AgentType, Status) in internal/session/types.go
- [x] T007 [P] Implement SessionStore with Add/Update/Remove/List/Get in internal/session/store.go
- [x] T008 Implement Sprites API client with auth handling in internal/sprites/client.go
- [x] T009 [P] Implement progress spinner and output helpers in internal/ui/progress.go
- [x] T010 [P] Implement error types and user-friendly formatting in internal/ui/errors.go
- [x] T011 Create root command with global flags (--config, --verbose, --version) in internal/cli/root.go
- [x] T012 Create main.go entry point that executes root command in cmd/sandctl/main.go

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Start a New Agent Session (Priority: P1) 🎯 MVP

**Goal**: Users can provision a sandboxed VM and start an AI agent with a prompt

**Independent Test**: Run `sandctl start --prompt "Create a React app"` and verify VM is created with agent running

### Implementation for User Story 1

- [x] T013 [US1] Add CreateSprite method to Sprites client in internal/sprites/client.go
- [x] T014 [US1] Add GetSprite method to Sprites client for status polling in internal/sprites/client.go
- [x] T015 [US1] Implement session ID generator (sandctl-{random8}) in internal/session/id.go
- [x] T016 [US1] Implement start command with --prompt, --agent, --timeout flags in internal/cli/start.go
- [x] T017 [US1] Add provisioning workflow: create sprite → inject API keys → start agent in internal/cli/start.go
- [x] T018 [US1] Add progress display during provisioning (3 steps) in internal/cli/start.go
- [x] T019 [US1] Add session to local store after successful start in internal/cli/start.go
- [x] T020 [US1] Implement cleanup on provisioning failure in internal/cli/start.go
- [x] T021 [US1] Add first-run config setup prompt when config missing in internal/cli/start.go

**Checkpoint**: User Story 1 complete - users can start sandboxed agent sessions

---

## Phase 4: User Story 2 - List Active Sessions (Priority: P2)

**Goal**: Users can see all active sandboxed sessions with status

**Independent Test**: Start a session, then run `sandctl list` and verify table output shows the session

### Implementation for User Story 2

- [x] T022 [US2] Add ListSprites method to Sprites client in internal/sprites/client.go
- [x] T023 [US2] Implement list command with --format (table/json) and --all flags in internal/cli/list.go
- [x] T024 [US2] Implement table formatter for session output in internal/ui/table.go
- [x] T025 [US2] Implement JSON formatter for session output in internal/cli/list.go
- [x] T026 [US2] Sync local session store with Sprites API state in internal/cli/list.go
- [x] T027 [US2] Handle empty state with helpful message in internal/cli/list.go

**Checkpoint**: User Story 2 complete - users can list and monitor sessions

---

## Phase 5: User Story 3 - Connect to a Session (Priority: P3)

**Goal**: Users can open an interactive shell inside a running VM

**Independent Test**: Start a session, then run `sandctl exec <id>` and verify shell access works

### Implementation for User Story 3

- [x] T028 [US3] Add ExecWebSocket method to Sprites client in internal/sprites/client.go
- [x] T029 [US3] Implement WebSocket connection handling for interactive shell in internal/sprites/exec.go
- [x] T030 [US3] Implement exec command with session-id argument and --command flag in internal/cli/exec.go
- [x] T031 [US3] Add terminal raw mode handling for interactive sessions in internal/cli/exec.go
- [x] T032 [US3] Add single command execution mode (-c flag) in internal/cli/exec.go
- [x] T033 [US3] Add session validation (exists, is running) before connect in internal/cli/exec.go
- [x] T034 [US3] Handle connection errors and session not found gracefully in internal/cli/exec.go

**Checkpoint**: User Story 3 complete - users can shell into running sessions

---

## Phase 6: User Story 4 - Destroy a Session (Priority: P4)

**Goal**: Users can terminate and remove a sandboxed VM

**Independent Test**: Start a session, run `sandctl destroy <id>`, verify it no longer appears in list

### Implementation for User Story 4

- [x] T035 [US4] Add DeleteSprite method to Sprites client in internal/sprites/client.go
- [x] T036 [US4] Implement destroy command with session-id argument and --force flag in internal/cli/destroy.go
- [x] T037 [US4] Add confirmation prompt (unless --force) in internal/cli/destroy.go
- [x] T038 [US4] Remove session from local store after successful destroy in internal/cli/destroy.go
- [x] T039 [US4] Handle session not found error with helpful message in internal/cli/destroy.go

**Checkpoint**: User Story 4 complete - users can clean up sessions

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T040 [P] Add --help examples for all commands in internal/cli/*.go
- [x] T041 [P] Add version command showing build info in internal/cli/root.go
- [x] T042 Verify all exit codes match CLI contract in internal/cli/*.go
- [x] T043 [P] Add verbose logging when --verbose flag is set in internal/cli/root.go
- [x] T044 Run govulncheck and address any dependency vulnerabilities
- [ ] T045 Validate quickstart.md scenarios work end-to-end
- [x] T046 [P] Create release build configuration in Makefile

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies - start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 - BLOCKS all user stories
- **Phase 3-6 (User Stories)**: All depend on Phase 2 completion
  - Stories can proceed in parallel or sequentially (P1 → P2 → P3 → P4)
- **Phase 7 (Polish)**: Depends on at least Phase 3 (MVP) completion

### User Story Dependencies

- **US1 (Start)**: Can start after Phase 2 - No dependencies on other stories
- **US2 (List)**: Can start after Phase 2 - Benefits from US1 for testing but independently implementable
- **US3 (Exec)**: Can start after Phase 2 - Requires US1 sessions to exist for meaningful testing
- **US4 (Destroy)**: Can start after Phase 2 - Requires US1 sessions to exist for meaningful testing

### Within Each User Story

- Sprites client methods before CLI command implementation
- CLI command before helper utilities
- Core functionality before error handling polish

### Parallel Opportunities

**Phase 1:**
```
T001 (structure) → T002 (go mod)
                 ↘ T003 (lint) [P]
                 ↘ T004 (makefile) [P]
```

**Phase 2:**
```
T005 (config) ──────────────────────────────┐
T006 (types) [P] ────────────────────────────┤
T007 (store) [P] ────────────────────────────┼→ T011 (root) → T012 (main)
T008 (sprites client) ──────────────────────┤
T009 (progress) [P] ────────────────────────┤
T010 (errors) [P] ──────────────────────────┘
```

**User Stories (after Phase 2):**
- All 4 user stories CAN run in parallel if team capacity allows
- Sequential execution recommended for single developer: US1 → US2 → US3 → US4

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (Start)
4. **STOP and VALIDATE**: Test `sandctl start` independently
5. Deploy/demo if ready - users can already provision agents!

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 (Start) → Test → Release v0.1.0 (MVP!)
3. Add US2 (List) → Test → Release v0.2.0
4. Add US3 (Exec) → Test → Release v0.3.0
5. Add US4 (Destroy) → Test → Release v0.4.0
6. Polish → Release v1.0.0

### Parallel Team Strategy

With multiple developers:
1. Team completes Setup + Foundational together
2. Once Phase 2 is done:
   - Developer A: US1 (Start) + US4 (Destroy)
   - Developer B: US2 (List) + US3 (Exec)
3. Stories integrate via shared Sprites client and session store

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- Each user story is independently testable
- Commit after each task or logical group
- Stop at any checkpoint to validate and potentially release
- All file paths are relative to repository root
