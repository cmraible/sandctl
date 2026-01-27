# Tasks: Rename Repo Commands to Template

**Input**: Design documents from `/specs/018-rename-repo-to-template/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Not explicitly requested - test tasks omitted.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Delete Legacy Code)

**Purpose**: Remove old repo code to start with a clean slate

- [X] T001 Delete internal/repo/parser.go
- [X] T002 [P] Delete internal/repo/parser_test.go
- [X] T003 [P] Delete internal/repoconfig/store.go
- [X] T004 [P] Delete internal/repoconfig/types.go
- [X] T005 [P] Delete internal/repoconfig/normalize.go
- [X] T006 [P] Delete internal/repoconfig/template.go
- [X] T007 [P] Delete internal/cli/repo.go
- [X] T008 [P] Delete internal/cli/repo_add.go
- [X] T009 [P] Delete internal/cli/repo_edit.go
- [X] T010 [P] Delete internal/cli/repo_list.go
- [X] T011 [P] Delete internal/cli/repo_remove.go
- [X] T012 [P] Delete internal/cli/repo_show.go
- [X] T013 [P] Delete tests/e2e/repo_test.go (if exists)

---

## Phase 2: Foundational (Template Store Package)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**CRITICAL**: No user story work can begin until this phase is complete

- [X] T014 Create internal/templateconfig/types.go with TemplateConfig struct and Duration wrapper
- [X] T015 Create internal/templateconfig/normalize.go with NormalizeName function
- [X] T016 Create internal/templateconfig/store.go with Store struct and NewStore function
- [X] T017 Add Store.Add method to internal/templateconfig/store.go
- [X] T018 Add Store.Get method (case-insensitive) to internal/templateconfig/store.go
- [X] T019 Add Store.List method to internal/templateconfig/store.go
- [X] T020 Add Store.Remove method to internal/templateconfig/store.go
- [X] T021 Add Store.Exists method to internal/templateconfig/store.go
- [X] T022 Add Store.GetInitScript method to internal/templateconfig/store.go
- [X] T023 Add Store.GetInitScriptPath method to internal/templateconfig/store.go
- [X] T024 Create internal/templateconfig/template.go with GenerateInitScript function

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Create a New Template (Priority: P1)

**Goal**: Users can create templates with `sandctl template add <name>` and edit the init script

**Independent Test**: Run `sandctl template add Ghost` and verify directory created, editor opens

- [X] T025 [US1] Create internal/cli/template.go with parent template command
- [X] T026 [US1] Register template command in internal/cli/root.go
- [X] T027 [US1] Create internal/cli/template_add.go with add subcommand
- [X] T028 [US1] Implement editor detection (EDITOR, VISUAL, fallback to vim/vi/nano) in internal/cli/template_add.go
- [X] T029 [US1] Add error handling for empty template name in internal/cli/template_add.go
- [X] T030 [US1] Add error handling for duplicate template name in internal/cli/template_add.go

**Checkpoint**: User Story 1 complete - users can create templates

---

## Phase 4: User Story 2 - Use Template with sandctl new (Priority: P1)

**Goal**: Users can create sessions with `sandctl new --template <name>` that runs the template's init script

**Independent Test**: Create a template, run `sandctl new -T Ghost`, verify init script executed

- [X] T031 [US2] Remove -R/--repo flag from internal/cli/new.go
- [X] T032 [US2] Add -T/--template flag to internal/cli/new.go
- [X] T033 [US2] Import templateconfig package in internal/cli/new.go
- [X] T034 [US2] Add template lookup logic in internal/cli/new.go (case-insensitive)
- [X] T035 [US2] Update cloud-init script generation to use SANDCTL_TEMPLATE_NAME and SANDCTL_TEMPLATE_NORMALIZED environment variables in internal/hetzner/cloud_init.go (or relevant file)
- [X] T036 [US2] Remove SANDCTL_REPO_URL, SANDCTL_REPO_PATH, SANDCTL_REPO environment variables from cloud-init
- [X] T037 [US2] Add error handling for non-existent template in internal/cli/new.go

**Checkpoint**: User Story 2 complete - users can use templates with sandctl new

---

## Phase 5: User Story 3 - List Templates (Priority: P2)

**Goal**: Users can see all configured templates with `sandctl template list`

**Independent Test**: Create multiple templates, run `sandctl template list`, verify all appear

- [X] T038 [US3] Create internal/cli/template_list.go with list subcommand
- [X] T039 [US3] Implement tabular output with NAME and CREATED columns in internal/cli/template_list.go
- [X] T040 [US3] Add "No templates configured" message when list is empty in internal/cli/template_list.go

**Checkpoint**: User Story 3 complete - users can list templates

---

## Phase 6: User Story 4 - Edit a Template (Priority: P2)

**Goal**: Users can modify existing templates with `sandctl template edit <name>`

**Independent Test**: Create a template, run `sandctl template edit Ghost`, verify editor opens with init.sh

- [X] T041 [US4] Create internal/cli/template_edit.go with edit subcommand
- [X] T042 [US4] Implement editor detection (reuse pattern from template_add) in internal/cli/template_edit.go
- [X] T043 [US4] Add error handling for non-existent template in internal/cli/template_edit.go

**Checkpoint**: User Story 4 complete - users can edit templates

---

## Phase 7: User Story 5 - Show Template Details (Priority: P3)

**Goal**: Users can view init script contents with `sandctl template show <name>`

**Independent Test**: Create a template with content, run `sandctl template show Ghost`, verify content displayed

- [X] T044 [US5] Create internal/cli/template_show.go with show subcommand
- [X] T045 [US5] Implement init script content output to stdout in internal/cli/template_show.go
- [X] T046 [US5] Add error handling for non-existent template in internal/cli/template_show.go

**Checkpoint**: User Story 5 complete - users can show template details

---

## Phase 8: User Story 6 - Remove a Template (Priority: P3)

**Goal**: Users can delete templates with confirmation via `sandctl template remove <name>`

**Independent Test**: Create a template, run `sandctl template remove Ghost`, confirm, verify deleted

- [X] T047 [US6] Create internal/cli/template_remove.go with remove subcommand
- [X] T048 [US6] Implement interactive confirmation prompt "Delete template '<name>'? [y/N]" in internal/cli/template_remove.go
- [X] T049 [US6] Add terminal detection using golang.org/x/term.IsTerminal() in internal/cli/template_remove.go
- [X] T050 [US6] Add --force/-f flag to bypass confirmation in internal/cli/template_remove.go
- [X] T051 [US6] Add error handling for non-existent template in internal/cli/template_remove.go
- [X] T052 [US6] Add error handling for non-interactive mode without --force flag in internal/cli/template_remove.go

**Checkpoint**: User Story 6 complete - users can remove templates with confirmation

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T053 [P] Remove any remaining references to repo/repoconfig packages in codebase
- [X] T054 Run go mod tidy to clean up dependencies
- [X] T055 Run go build to verify compilation succeeds
- [X] T056 Verify all template commands work end-to-end manually per quickstart.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: No blocking dependencies, but cleaner to complete after Setup
- **User Stories (Phase 3-8)**: All depend on Foundational phase completion
  - US1 and US2 are P1 priority - implement first
  - US3 and US4 are P2 priority - implement after P1
  - US5 and US6 are P3 priority - implement last
- **Polish (Phase 9)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 3 (P2)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 4 (P2)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 5 (P3)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 6 (P3)**: Can start after Foundational (Phase 2) - No dependencies on other stories

### Within Each User Story

- CLI command file depends on store methods existing
- Error handling after core implementation
- Each story is independently testable

### Parallel Opportunities

- All Setup deletion tasks marked [P] can run in parallel
- Once Foundational phase completes, user stories can start in parallel (if team capacity allows)
- User Story 1 and User Story 2 (both P1) can be implemented in parallel
- User Story 3 and User Story 4 (both P2) can be implemented in parallel
- User Story 5 and User Story 6 (both P3) can be implemented in parallel

---

## Parallel Example: Phase 1 Setup

```bash
# Launch all deletion tasks together:
Task: "Delete internal/repo/parser.go"
Task: "Delete internal/repo/parser_test.go"
Task: "Delete internal/repoconfig/store.go"
Task: "Delete internal/repoconfig/types.go"
Task: "Delete internal/repoconfig/normalize.go"
Task: "Delete internal/repoconfig/template.go"
Task: "Delete internal/cli/repo.go"
Task: "Delete internal/cli/repo_add.go"
Task: "Delete internal/cli/repo_edit.go"
Task: "Delete internal/cli/repo_list.go"
Task: "Delete internal/cli/repo_remove.go"
Task: "Delete internal/cli/repo_show.go"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Setup (delete legacy code)
2. Complete Phase 2: Foundational (templateconfig package)
3. Complete Phase 3: User Story 1 (template add)
4. Complete Phase 4: User Story 2 (sandctl new --template)
5. **STOP and VALIDATE**: Test creating templates and using them with sandctl new
6. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational -> Foundation ready
2. Add User Story 1 (template add) -> Test independently -> MVP demo
3. Add User Story 2 (sandctl new --template) -> Test independently -> Core functionality complete
4. Add User Story 3 (template list) -> Test independently
5. Add User Story 4 (template edit) -> Test independently
6. Add User Story 5 (template show) -> Test independently
7. Add User Story 6 (template remove) -> Test independently -> Full feature complete

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (template add)
   - Developer B: User Story 2 (sandctl new --template)
3. Then:
   - Developer A: User Story 3 (template list)
   - Developer B: User Story 4 (template edit)
4. Then:
   - Developer A: User Story 5 (template show)
   - Developer B: User Story 6 (template remove)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- This is a breaking change - no backward compatibility with old repo commands
