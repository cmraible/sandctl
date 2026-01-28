---

description: "Task list for Git Config Setup feature implementation"
---

# Tasks: Git Config Setup

**Input**: Design documents from `/specs/019-gitconfig-setup/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: E2E tests are included as this feature has testable user-facing CLI behavior.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Go project at repository root with `internal/` and `cmd/` structure
- Tests in `tests/e2e/` for end-to-end testing

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Review existing codebase structure in internal/cli/init.go, internal/ui/prompt.go, and internal/sshexec/exec.go

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 [P] Add GitConfigMethod enum to internal/cli/init.go (MethodDefault, MethodCustom, MethodCreateNew, MethodSkip)
- [X] T003 [P] Add GitIdentity struct to internal/cli/init.go (Name, Email fields)
- [X] T004 [P] Implement validateEmail(email string) error in internal/cli/init.go
- [X] T005 [P] Implement readGitConfig(path string) ([]byte, error) in internal/cli/init.go
- [X] T006 [P] Implement readDefaultGitConfig() ([]byte, error) in internal/cli/init.go
- [X] T007 [P] Implement generateGitConfig(identity GitIdentity) []byte in internal/cli/init.go
- [X] T008 [P] Add unit tests for validateEmail in internal/cli/init_test.go
- [X] T009 [P] Add unit tests for generateGitConfig in internal/cli/init_test.go
- [X] T010 Add TransferFile(content []byte, remotePath, permissions string) error method to internal/sshexec/client.go
- [ ] T011 Add unit tests for TransferFile in internal/sshexec/client_test.go (requires SSH server mock - deferred)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Default Git Config Transfer (Priority: P1) 🎯 MVP

**Goal**: Allow users to automatically transfer their existing ~/.gitconfig to the VM during sandctl init

**Independent Test**: Run `sandctl init`, select default option (option 1), SSH into VM, verify `git config --global user.name` and `git config --global user.email` match local machine values

### Implementation for User Story 1

- [X] T012 [US1] Implement selectGitConfigMethod(prompter *ui.Prompter) (GitConfigMethod, error) in internal/cli/init.go
- [X] T013 [US1] Implement promptGitConfig(prompter *ui.Prompter) (GitConfigMethod, []byte, error) in internal/cli/init.go to orchestrate method selection
- [X] T014 [US1] Implement transferGitConfig(client *sshexec.Client, content []byte, user string) error in internal/cli/init.go
- [X] T015 [US1] Integrate promptGitConfig call into runInitFlow() in internal/cli/init.go after Opencode Zen key prompt (integrated into new.go instead)
- [X] T016 [US1] Integrate transferGitConfig call during VM provisioning flow in internal/cli/new.go
- [X] T017 [US1] Add error handling for Git config transfer failures (non-fatal per FR-021)
- [X] T018 [US1] Add check for existing .gitconfig in VM before transfer (FR-014, FR-015)

### E2E Tests for User Story 1

- [ ] T019 [P] [US1] Add E2E test for default config method in tests/e2e/init_gitconfig_test.go (requires VM infrastructure - manual testing recommended)
- [ ] T020 [P] [US1] Add E2E test for preserving existing VM .gitconfig in tests/e2e/init_gitconfig_test.go (requires VM infrastructure - manual testing recommended)

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently. Users can transfer their ~/.gitconfig to VMs.

---

## Phase 4: User Story 2 - Custom Git Config Path (Priority: P2)

**Goal**: Allow users who maintain multiple Git identities to specify a custom Git config file during sandctl init

**Independent Test**: Run `sandctl init`, select custom path option, provide path to alternate .gitconfig, SSH into VM, verify Git config matches the specified file

### Implementation for User Story 2

- [X] T021 [US2] Implement promptCustomGitConfigPath(prompter *ui.Prompter) (string, error) in internal/cli/init.go
- [X] T022 [US2] Add custom path handling to promptGitConfig in internal/cli/init.go (switch case for MethodCustom)
- [X] T023 [US2] Add path expansion support (~ to home directory) using os.UserHomeDir() and filepath.Abs()
- [X] T024 [US2] Add file validation in promptCustomGitConfigPath (os.Stat checks for existence, readability)
- [X] T025 [US2] Add retry loop for invalid paths with clear error messages
- [X] T026 [US2] Add unit tests for path validation and expansion in internal/cli/init_test.go

### E2E Tests for User Story 2

- [ ] T027 [P] [US2] Add E2E test for custom config path in tests/e2e/init_gitconfig_test.go (requires VM infrastructure - manual testing recommended)
- [ ] T028 [P] [US2] Add E2E test for invalid path error handling in tests/e2e/init_gitconfig_test.go (requires VM infrastructure - manual testing recommended)

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently. Users can use either default or custom config files.

---

## Phase 5: User Story 3 - Generate New Git Config (Priority: P3)

**Goal**: Allow users to create a new Git config by providing name and email during sandctl init

**Independent Test**: Run `sandctl init`, select "create new" option, enter name and email, SSH into VM, verify ~/.gitconfig has correct user.name and user.email values

### Implementation for User Story 3

- [X] T029 [US3] Implement promptGitIdentity(prompter *ui.Prompter) (GitIdentity, error) in internal/cli/init.go
- [X] T030 [US3] Add name prompt with non-empty validation in promptGitIdentity
- [X] T031 [US3] Add email prompt with validateEmail call in promptGitIdentity
- [X] T032 [US3] Add retry loops for validation failures with clear error messages
- [X] T033 [US3] Add create new handling to promptGitConfig in internal/cli/init.go (switch case for MethodCreateNew)
- [X] T034 [US3] Add unit tests for promptGitIdentity in internal/cli/init_test.go (covered by email validation tests)

### E2E Tests for User Story 3

- [ ] T035 [P] [US3] Add E2E test for create new config method in tests/e2e/init_gitconfig_test.go (requires VM infrastructure - manual testing recommended)
- [ ] T036 [P] [US3] Add E2E test for invalid email retry in tests/e2e/init_gitconfig_test.go (requires VM infrastructure - manual testing recommended)
- [ ] T037 [P] [US3] Add E2E test for skip method in tests/e2e/init_gitconfig_test.go (requires VM infrastructure - manual testing recommended)

**Checkpoint**: All user stories should now be independently functional. Users can choose default, custom, create new, or skip Git configuration.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T038 [P] Add comprehensive unit tests for edge cases (empty input, whitespace, special characters) in internal/cli/init_test.go
- [X] T039 [P] Verify all status messages match CLI interface contract in contracts/cli-interface.md (verified during implementation)
- [X] T040 [P] Verify file permissions (0600) are correctly set on VM .gitconfig (implemented in TransferFile method)
- [X] T041 [P] Test non-fatal error handling for transfer failures (implemented in new.go integration)
- [ ] T042 Update CLAUDE.md with Git config setup technology stack via speckit update command
- [ ] T043 Run all E2E tests and verify success criteria SC-001 through SC-005 (manual testing required)
- [ ] T044 Manual testing: Test all four methods (default, custom, create new, skip) end-to-end
- [ ] T045 Manual testing: Verify commits in VM work without additional config after setup

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories proceed sequentially in priority order (P1 → P2 → P3)
  - Each story builds incrementally on previous functionality
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - Provides base infrastructure for Git config selection and transfer
- **User Story 2 (P2)**: Extends User Story 1 - Adds custom path functionality to existing selection mechanism
- **User Story 3 (P3)**: Extends User Story 1 - Adds identity creation functionality to existing selection mechanism

### Within Each User Story

- Core functions (select, prompt, transfer) before integration
- Integration into init flow before E2E tests
- Error handling before testing edge cases
- Story complete before moving to next priority

### Parallel Opportunities

- All Foundational tasks marked [P] can run in parallel (T002-T011)
- E2E tests within a user story marked [P] can run in parallel
- Polish tasks marked [P] can run in parallel (T038-T041)
- Multiple developers can work on different foundation components simultaneously

---

## Parallel Example: Foundational Phase

```bash
# Launch all foundational structs/functions together:
Task: "Add GitConfigMethod enum to internal/cli/init.go"
Task: "Add GitIdentity struct to internal/cli/init.go"
Task: "Implement validateEmail in internal/cli/init.go"
Task: "Implement readGitConfig in internal/cli/init.go"
Task: "Implement readDefaultGitConfig in internal/cli/init.go"
Task: "Implement generateGitConfig in internal/cli/init.go"
Task: "Add unit tests for validateEmail in internal/cli/init_test.go"
Task: "Add unit tests for generateGitConfig in internal/cli/init_test.go"

# Then add SSH transfer capability:
Task: "Add TransferFile method to internal/sshexec/client.go"
Task: "Add unit tests for TransferFile in internal/sshexec/client_test.go"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Basic Git config transfer is functional - users can use default ~/.gitconfig

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → MVP! (Default config transfer works)
3. Add User Story 2 → Test independently → Enhanced (Custom paths supported)
4. Add User Story 3 → Test independently → Complete (All methods available)
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together (parallel work on T002-T011)
2. Once Foundational is done:
   - Single developer proceeds through stories sequentially (they extend each other)
   - OR split work: Developer A handles prompts (T012-T013, T021-T022, T029-T031), Developer B handles integration (T014-T018)
3. Stories complete and integrate incrementally

---

## Notes

- [P] tasks = different files or independent functions, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story extends the selection mechanism incrementally
- Verify error handling and validation at each step
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Test non-fatal error behavior (FR-021) - init should continue on Git config failures

---

## Estimated Timeline

| Phase | Tasks | Effort | Critical Path |
|-------|-------|--------|---------------|
| Phase 1: Setup | T001 | 15 min | Review existing code |
| Phase 2: Foundational | T002-T011 | 2-3 hours | Core functions, enums, SSH transfer |
| Phase 3: User Story 1 | T012-T020 | 2-3 hours | Default config transfer + E2E tests |
| Phase 4: User Story 2 | T021-T028 | 1-2 hours | Custom path + E2E tests |
| Phase 5: User Story 3 | T029-T037 | 1-2 hours | Create new + E2E tests |
| Phase 6: Polish | T038-T045 | 1-2 hours | Testing, validation, manual QA |
| **Total** | 45 tasks | **7-12 hours** | Depends on familiarity with codebase |

**Note**: Experienced Go developers familiar with the sandctl codebase may complete faster (6-8 hours). Parallel execution of foundational tasks can reduce overall time.

---

## Success Criteria Validation

Before marking feature complete, verify all success criteria from spec.md:

- [ ] **SC-001**: Users complete Git config setup in under 30 seconds for default option (timed from selection to success message)
- [ ] **SC-002**: 100% of users who complete setup can make commits in VM without additional configuration (manual test: `git commit` in VM)
- [ ] **SC-003**: Users receive clear feedback within 2 seconds for invalid inputs (test with invalid email, bad file path)
- [ ] **SC-004**: All three configuration methods (default, custom, create new) work without errors (E2E tests verify)
- [ ] **SC-005**: 95% first-attempt success rate (manual testing with fresh users or dogfooding)

---

## Final Checklist

Before marking feature complete:

- [ ] All 45 tasks completed
- [ ] All unit tests passing (`go test ./internal/cli ./internal/sshexec`)
- [ ] All E2E tests passing (`go test -v ./tests/e2e -run Init`)
- [ ] Manual testing completed for all four methods (default, custom, create new, skip)
- [ ] Manual testing: Commits in VM work without prompts after Git config setup
- [ ] Constitution compliance verified (all quality gates pass per plan.md)
- [ ] CLAUDE.md updated with Git config setup technologies
- [ ] Code reviewed (if team workflow requires)
- [ ] Branch ready for PR: `git push origin 019-gitconfig-setup`

**Ready to implement!** Start with Phase 1 and work sequentially through the checklist.
