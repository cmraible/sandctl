# Tasks: Repository Initialization Scripts

**Input**: Design documents from `/specs/014-repo-init-scripts/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: E2E tests included in Polish phase (per constitution Principle V).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project (Go CLI)**: `internal/` for packages, `cmd/` for main entry
- Paths follow existing sandctl patterns from plan.md

---

## Phase 1: Setup (Package Structure)

**Purpose**: Create the new repoconfig package with type definitions

- [X] T001 Create internal/repoconfig/ package directory structure
- [X] T002 [P] Create RepoConfig struct and Duration type in internal/repoconfig/types.go
- [X] T003 [P] Implement NormalizeName function in internal/repoconfig/normalize.go
- [X] T004 [P] Create init script template constant in internal/repoconfig/template.go

**Checkpoint**: Package structure ready with types, normalization, and template

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core storage and parent command that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 Implement RepoStore with CRUD operations (Add, Get, List, Exists, Remove, GetInitScriptPath, DefaultReposPath) in internal/repoconfig/store.go
- [X] T006 Create repo parent command with help text in internal/cli/repo.go

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Configure Repository with Init Script (Priority: P1) 🎯 MVP

**Goal**: Users can add a repo configuration and have its init script execute automatically during `sandctl new -R`

**Independent Test**: Run `sandctl repo add -R tryghost/ghost`, edit init.sh to add `echo "hello"`, run `sandctl new -R tryghost/ghost`, verify "hello" appears in output.

### Implementation for User Story 1

- [X] T007 [US1] Implement `sandctl repo add` command with prompting and --repo/-R flag in internal/cli/repo_add.go
- [X] T008 [US1] Add helper function getRepoStore() to load/create repo store in internal/cli/repo.go
- [X] T009 [US1] Add init script lookup in runNew() - check if config exists for -R repo in internal/cli/new.go
- [X] T010 [US1] Implement runInitScript() function with script transfer via base64 and execution in internal/cli/new.go
- [X] T011 [US1] Add "Running init script" step to provisioning flow after cloneRepository in internal/cli/new.go

**Checkpoint**: User Story 1 complete - users can configure repos and have init scripts run automatically

---

## Phase 4: User Story 2 - Manage Repository Configurations (Priority: P2)

**Goal**: Users can list, view, edit, and remove their repository configurations

**Independent Test**: Create multiple configs with `repo add`, run `repo list` to see all, `repo show` to view one, `repo edit` to modify, `repo remove` to delete.

### Implementation for User Story 2

- [X] T012 [P] [US2] Implement `sandctl repo list` command with table and --json output in internal/cli/repo_list.go
- [X] T013 [P] [US2] Implement `sandctl repo show <repo>` command to display init script content in internal/cli/repo_show.go
- [X] T014 [P] [US2] Implement `sandctl repo edit <repo>` command with $VISUAL/$EDITOR/vi fallback in internal/cli/repo_edit.go
- [X] T015 [US2] Implement `sandctl repo remove <repo>` command with --force flag and confirmation in internal/cli/repo_remove.go

**Checkpoint**: User Story 2 complete - full CRUD operations for repo configurations

---

## Phase 5: User Story 3 - Init Script Error Handling (Priority: P3)

**Goal**: Users get clear feedback when init scripts fail, and sprites remain available for debugging

**Independent Test**: Create config with `exit 1` in init.sh, run `sandctl new -R`, verify error message shows and sprite remains available via `sandctl console`.

### Implementation for User Story 3

- [X] T016 [US3] Add timeout flag (--init-timeout) to repo add command in internal/cli/repo_add.go
- [X] T017 [US3] Read timeout from config.yaml and apply to script execution in internal/cli/new.go
- [X] T018 [US3] Implement graceful failure handling - print error, show sprite name, exit without console in internal/cli/new.go
- [X] T019 [US3] Add verbose logging for init script phases (transfer, execution, output) in internal/cli/new.go

**Checkpoint**: User Story 3 complete - robust error handling with debugging support

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: E2E testing and validation

- [X] T020 [P] Create E2E test for `sandctl repo add` command in tests/e2e/repo_test.go
- [X] T021 [P] Create E2E test for `sandctl repo list/show/edit/remove` commands in tests/e2e/repo_test.go
- [X] T022 Validate quickstart.md scenarios work end-to-end
- [X] T023 Run go vet and golint, fix any issues across new files

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion
  - US1 must complete before US3 (US3 builds on new.go changes from US1)
  - US2 can run in parallel with US1 (different files)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Independent of US1
- **User Story 3 (P3)**: Depends on US1 completion (builds on new.go init script execution)

### Within Each User Story

- Store operations before CLI commands
- CLI commands before new.go integration
- Core implementation before error handling refinements

### Parallel Opportunities

- T002, T003, T004 can run in parallel (different files in repoconfig/)
- T012, T013, T014 can run in parallel (different CLI command files)
- T020, T021 can run in parallel (different test functions)
- US1 and US2 can run in parallel after Foundational phase (different files)

---

## Parallel Example: Phase 1 Setup

```bash
# Launch all setup tasks together (different files):
Task: "Create RepoConfig struct in internal/repoconfig/types.go"
Task: "Implement NormalizeName in internal/repoconfig/normalize.go"
Task: "Create init script template in internal/repoconfig/template.go"
```

## Parallel Example: User Story 2

```bash
# Launch all US2 implementation tasks together:
Task: "Implement repo list command in internal/cli/repo_list.go"
Task: "Implement repo show command in internal/cli/repo_show.go"
Task: "Implement repo edit command in internal/cli/repo_edit.go"
# Note: repo_remove.go depends on the others being done for testing flow
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T004)
2. Complete Phase 2: Foundational (T005-T006)
3. Complete Phase 3: User Story 1 (T007-T011)
4. **STOP and VALIDATE**: Test `sandctl repo add` + `sandctl new -R` flow
5. Deploy/demo if ready - users can now configure repo init scripts!

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test repo add + new -R → **MVP Deployed**
3. Add User Story 2 → Test list/show/edit/remove → Management commands available
4. Add User Story 3 → Test error scenarios → Robust error handling
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (new.go integration)
   - Developer B: User Story 2 (management commands)
3. Developer A completes US1, then moves to US3
4. Polish phase when all stories complete

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Follow existing sandctl patterns: see internal/session/ for store patterns, internal/cli/init.go for command patterns
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- US1 is MVP - everything after that is enhancement
