# Tasks: Init Command

**Input**: Design documents from `/specs/002-init-command/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

**Tests**: Tests are included as the existing codebase uses BDD-style testing (per plan.md and constitution).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Per plan.md, this is a Go CLI project with structure:
- Source: `internal/` for packages, `cmd/sandctl/` for entry point
- Tests: Co-located with source files as `*_test.go`

---

## Phase 1: Setup

**Purpose**: Create foundational components needed by all user stories

- [x] T001 [P] Create config writer with atomic save in internal/config/writer.go
- [x] T002 [P] Create config writer tests in internal/config/writer_test.go
- [x] T003 [P] Create prompt helpers (PromptString, PromptSecret, PromptSelect) in internal/ui/prompt.go
- [x] T004 [P] Create prompt helper tests in internal/ui/prompt_test.go

**Checkpoint**: Core utilities ready - init command implementation can begin ✅

---

## Phase 2: User Story 1 - First-Time Setup (Priority: P1) 🎯 MVP

**Goal**: New user can run `sandctl init` and create a valid config file with Sprites token, agent selection, and API key.

**Independent Test**: Run `sandctl init` on a fresh system, verify config file created at `~/.sandctl/config` with 0600 permissions and valid YAML content.

### Tests for User Story 1

- [x] T005 [P] [US1] Test init command creates config when none exists in internal/cli/init_test.go
- [x] T006 [P] [US1] Test init command prompts for all required values in internal/cli/init_test.go
- [x] T007 [P] [US1] Test init command creates file with 0600 permissions in internal/cli/init_test.go

### Implementation for User Story 1

- [x] T008 [US1] Create init command skeleton with Cobra in internal/cli/init.go
- [x] T009 [US1] Implement interactive prompts for Sprites token (masked input) in internal/cli/init.go
- [x] T010 [US1] Implement agent selection prompt with numbered list in internal/cli/init.go
- [x] T011 [US1] Implement API key prompt for selected agent (masked input) in internal/cli/init.go
- [x] T012 [US1] Implement config file creation using config.Save() in internal/cli/init.go
- [x] T013 [US1] Add success message with next steps in internal/cli/init.go
- [x] T014 [US1] Update root command description to include init in internal/cli/root.go

**Checkpoint**: First-time setup fully functional - user can configure sandctl from scratch ✅

---

## Phase 3: User Story 2 - Reconfigure Existing Setup (Priority: P2)

**Goal**: User with existing config can update settings while preserving values they don't change.

**Independent Test**: Create a config file, run `sandctl init`, press Enter on all prompts, verify original values are preserved.

### Tests for User Story 2

- [x] T015 [P] [US2] Test init command loads existing config values as defaults in internal/cli/init_test.go
- [x] T016 [P] [US2] Test pressing Enter preserves existing values in internal/cli/init_test.go
- [x] T017 [P] [US2] Test entering new value replaces existing in internal/cli/init_test.go

### Implementation for User Story 2

- [x] T018 [US2] Load existing config at start of init flow in internal/cli/init.go
- [x] T019 [US2] Display masked existing token as default (show `***...***` pattern) in internal/cli/init.go
- [x] T020 [US2] Pre-select current agent in selection prompt in internal/cli/init.go
- [x] T021 [US2] Preserve existing API keys when updating in internal/cli/init.go

**Checkpoint**: Reconfiguration works - existing users can update their settings ✅

---

## Phase 4: User Story 3 - Non-Interactive Setup (Priority: P3)

**Goal**: User can configure sandctl via command-line flags for automation/scripting.

**Independent Test**: Run `sandctl init --sprites-token TOKEN --agent claude --api-key KEY`, verify config created without prompts.

### Tests for User Story 3

- [x] T022 [P] [US3] Test init command accepts --sprites-token flag in internal/cli/init_test.go
- [x] T023 [P] [US3] Test init command accepts --agent flag in internal/cli/init_test.go
- [x] T024 [P] [US3] Test init command accepts --api-key flag in internal/cli/init_test.go
- [x] T025 [P] [US3] Test init command skips prompts when all flags provided in internal/cli/init_test.go
- [x] T026 [P] [US3] Test init command errors on partial flags in non-interactive mode in internal/cli/init_test.go

### Implementation for User Story 3

- [x] T027 [US3] Add --sprites-token flag to init command in internal/cli/init.go
- [x] T028 [US3] Add --agent flag to init command in internal/cli/init.go
- [x] T029 [US3] Add --api-key flag to init command in internal/cli/init.go
- [x] T030 [US3] Skip prompts when flags provide all required values in internal/cli/init.go
- [x] T031 [US3] Detect non-interactive mode and error on missing required flags in internal/cli/init.go
- [x] T032 [US3] Add flag documentation to --help output in internal/cli/init.go

**Checkpoint**: Non-interactive mode complete - automation use cases supported ✅

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Edge cases, error handling, and final validation

- [x] T033 Handle Ctrl+C gracefully (no partial config file) in internal/cli/init.go (atomic writes via temp file)
- [x] T034 Handle directory creation failure with clear error message in internal/config/writer.go
- [x] T035 Handle permission setting failure with error message in internal/config/writer.go
- [x] T036 Add warning when no API key provided for selected agent in internal/cli/init.go
- [x] T037 Run all tests and verify passing with `go test ./...`
- [x] T038 Run linter with `go vet ./...` (golangci-lint not installed)
- [x] T039 Validate quickstart.md against actual implementation (implementation matches spec)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **User Story 1 (Phase 2)**: Depends on Setup (T001-T004) completion
- **User Story 2 (Phase 3)**: Depends on User Story 1 (builds on init flow)
- **User Story 3 (Phase 4)**: Depends on User Story 1 (extends init flow)
- **Polish (Phase 5)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Setup - No dependencies on other stories
- **User Story 2 (P2)**: Extends US1 implementation - needs init flow to exist
- **User Story 3 (P3)**: Extends US1 implementation - needs init flow to exist

### Within Each User Story

- Tests should be written first and fail before implementation
- Core prompts before config saving
- Story complete before moving to next priority

### Parallel Opportunities

**Phase 1 (Setup)** - All tasks can run in parallel:
```
T001 [P] config/writer.go
T002 [P] config/writer_test.go
T003 [P] ui/prompt.go
T004 [P] ui/prompt_test.go
```

**User Story 1 Tests** - All tests can run in parallel:
```
T005 [P] [US1] Test creates config
T006 [P] [US1] Test prompts for values
T007 [P] [US1] Test file permissions
```

**User Story 2 Tests** - All tests can run in parallel:
```
T015 [P] [US2] Test loads existing
T016 [P] [US2] Test preserves on Enter
T017 [P] [US2] Test replaces on input
```

**User Story 3 Tests** - All tests can run in parallel:
```
T022-T026 [P] [US3] All flag tests
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T004)
2. Complete Phase 2: User Story 1 (T005-T014)
3. **STOP and VALIDATE**: `sandctl init` works for new users
4. Deploy/demo if ready

### Incremental Delivery

1. Setup → Foundation ready
2. User Story 1 → New user setup works (MVP!)
3. User Story 2 → Existing user reconfiguration works
4. User Story 3 → Automation/scripting works
5. Polish → Edge cases handled

### Parallel Team Strategy

With multiple developers:
1. Team completes Setup together (all [P] tasks)
2. Once Setup complete:
   - Developer A: User Story 1 tests then implementation
   - Developer B: Can prepare US2/US3 tests while waiting
3. After US1 complete:
   - Developer A: User Story 2
   - Developer B: User Story 3 (independent of US2)

---

## Summary

| Phase | Tasks | Parallel Tasks |
|-------|-------|----------------|
| Setup | 4 | 4 |
| User Story 1 (P1) | 10 | 3 |
| User Story 2 (P2) | 7 | 3 |
| User Story 3 (P3) | 11 | 5 |
| Polish | 7 | 0 |
| **Total** | **39** | **15** |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Tests use BDD naming: `TestFunction_GivenCondition_ThenExpectedResult`
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
