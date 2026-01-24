# Tasks: Simplified Init with Opencode Zen

**Input**: Design documents from `/specs/006-opencode-default-agent/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Tests are included as this is a refactoring of existing functionality with breaking schema changes.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

This is a single Go CLI project with the following structure:
- **Source**: `internal/` at repository root
- **Tests**: `*_test.go` files alongside source files
- **Config**: `~/.sandctl/config` (YAML, 0600 permissions)

---

## Phase 1: Setup (Schema Changes)

**Purpose**: Update configuration schema to support simplified two-key model

- [ ] T001 Remove `AgentType` type and constants from `internal/config/config.go`
- [ ] T002 Remove `DefaultAgent` field from Config struct in `internal/config/config.go`
- [ ] T003 Remove `AgentAPIKeys` field from Config struct in `internal/config/config.go`
- [ ] T004 Add `OpencodeZenKey` field to Config struct in `internal/config/config.go`
- [ ] T005 Remove `ValidAgentTypes()` function from `internal/config/config.go`
- [ ] T006 Update `Validate()` to require `OpencodeZenKey` instead of `DefaultAgent` in `internal/config/config.go`
- [ ] T007 Remove `Agent` field from Session struct in `internal/session/types.go`

**Checkpoint**: Schema changes complete - compilation will fail until init/start commands are updated

---

## Phase 2: Foundational (Test Updates)

**Purpose**: Update existing tests to match new schema - tests will fail until implementation is complete

**⚠️ CRITICAL**: These tests establish the contract for the new behavior

- [ ] T008 [P] Update config test fixtures for new schema in `internal/config/config_test.go`
- [ ] T009 [P] Remove agent-related test cases from `internal/config/config_test.go`
- [ ] T010 [P] Add test for `OpencodeZenKey` validation in `internal/config/config_test.go`

**Checkpoint**: Tests updated and failing - ready for implementation

---

## Phase 3: User Story 1 - Initialize with Sprites and Opencode Zen Keys (Priority: P1) 🎯 MVP

**Goal**: User runs `sandctl init` and is prompted for only Sprites token and Opencode Zen key

**Independent Test**: Run `sandctl init`, provide both keys, verify config file contains only `sprites_token` and `opencode_zen_key`

### Tests for User Story 1

- [ ] T011 [P] [US1] Update test for new init prompts (2 prompts only) in `internal/cli/init_test.go`
- [ ] T012 [P] [US1] Update test for config file contents (no default_agent) in `internal/cli/init_test.go`
- [ ] T013 [P] [US1] Remove agent selection test cases from `internal/cli/init_test.go`

### Implementation for User Story 1

- [ ] T014 [US1] Remove `initAgent` and `initAPIKey` global vars from `internal/cli/init.go`
- [ ] T015 [US1] Add `initOpencodeZenKey` global var in `internal/cli/init.go`
- [ ] T016 [US1] Remove `--agent` flag registration from `internal/cli/init.go`
- [ ] T017 [US1] Rename `--api-key` flag to `--opencode-zen-key` in `internal/cli/init.go`
- [ ] T018 [US1] Remove `promptAgentSelection()` function from `internal/cli/init.go`
- [ ] T019 [US1] Simplify `promptAPIKey()` to `promptOpencodeZenKey()` in `internal/cli/init.go`
- [ ] T020 [US1] Update `runInitFlow()` to use only 2 prompts in `internal/cli/init.go`
- [ ] T021 [US1] Update help text and command description in `internal/cli/init.go`
- [ ] T022 [US1] Update success message to show correct next steps in `internal/cli/init.go`

**Checkpoint**: `sandctl init` works with 2 prompts only, config saved correctly

---

## Phase 4: User Story 2 - Automatic OpenCode Login in Sandbox (Priority: P2)

**Goal**: When sandbox is provisioned, OpenCode auth file is created automatically

**Independent Test**: Run `sandctl start`, verify `~/.local/share/opencode/auth.json` exists in sandbox with correct structure

### Tests for User Story 2

- [ ] T023 [P] [US2] Add test for `setupOpenCodeAuth()` function in `internal/cli/start_test.go`
- [ ] T024 [P] [US2] Add test for auth file creation error handling in `internal/cli/start_test.go`

### Implementation for User Story 2

- [ ] T025 [US2] Add `setupOpenCodeAuth()` function to `internal/cli/start.go`
- [ ] T026 [US2] Implement directory creation (`~/.local/share/opencode/`) in `setupOpenCodeAuth()`
- [ ] T027 [US2] Implement auth file creation with JSON structure in `setupOpenCodeAuth()`
- [ ] T028 [US2] Add error handling with warning (don't fail provisioning) in `setupOpenCodeAuth()`
- [ ] T029 [US2] Integrate `setupOpenCodeAuth()` into sandbox provisioning flow in `internal/cli/start.go`
- [ ] T030 [US2] Remove agent-related config validation from start command in `internal/cli/start.go`
- [ ] T031 [US2] Update start command to use `OpencodeZenKey` from config in `internal/cli/start.go`

**Checkpoint**: Sandbox provisioning creates OpenCode auth file, warns on failure but continues

---

## Phase 5: User Story 3 - Non-Interactive Init Mode (Priority: P3)

**Goal**: `sandctl init --sprites-token TOKEN --opencode-zen-key KEY` works without prompts

**Independent Test**: Run with both flags in non-TTY environment, verify config saved without prompts

### Tests for User Story 3

- [ ] T032 [P] [US3] Update non-interactive test for new flags in `internal/cli/init_test.go`
- [ ] T033 [P] [US3] Add test for missing `--opencode-zen-key` error in `internal/cli/init_test.go`
- [ ] T034 [P] [US3] Add test for missing `--sprites-token` error in `internal/cli/init_test.go`

### Implementation for User Story 3

- [ ] T035 [US3] Update `runNonInteractiveInit()` to use new flags in `internal/cli/init.go`
- [ ] T036 [US3] Update validation to require both flags in `internal/cli/init.go`
- [ ] T037 [US3] Remove agent validation from non-interactive flow in `internal/cli/init.go`

**Checkpoint**: Non-interactive mode works with exactly 2 flags

---

## Phase 6: User Story 4 - Migration from Previous Configuration (Priority: P4)

**Goal**: Users with old config format can upgrade by running `sandctl init`

**Independent Test**: Create old-format config, run `sandctl init`, verify Sprites token preserved and new format saved

### Tests for User Story 4

- [ ] T038 [P] [US4] Add test for migration from old config format in `internal/cli/init_test.go`
- [ ] T039 [P] [US4] Add test for Sprites token preservation during migration in `internal/cli/init_test.go`
- [ ] T040 [P] [US4] Add test for old agent keys removal during migration in `internal/cli/init_test.go`

### Implementation for User Story 4

- [ ] T041 [US4] Update `loadExistingConfig()` to handle old format gracefully in `internal/cli/init.go`
- [ ] T042 [US4] Ensure Sprites token is preserved as default value in `internal/cli/init.go`
- [ ] T043 [US4] Verify old fields are not written when saving new config in `internal/cli/init.go`

**Checkpoint**: Migration works seamlessly, Sprites token preserved

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final cleanup and validation

- [ ] T044 Run `go build ./...` to verify compilation
- [ ] T045 Run `go test ./...` to verify all tests pass
- [ ] T046 Run `golangci-lint run` to verify code quality
- [ ] T047 [P] Remove any unused imports or dead code
- [ ] T048 [P] Update any remaining references to old agent types
- [ ] T049 Manual test: Run `sandctl init` interactively and verify 2-prompt flow
- [ ] T050 Manual test: Run `sandctl init --sprites-token X --opencode-zen-key Y` non-interactively
- [ ] T051 Manual test: Verify old config migration preserves Sprites token

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - updates test expectations
- **User Story 1 (Phase 3)**: Depends on Foundational - core init simplification
- **User Story 2 (Phase 4)**: Depends on Phase 1 schema changes only - can run parallel with US1
- **User Story 3 (Phase 5)**: Depends on User Story 1 completion
- **User Story 4 (Phase 6)**: Depends on User Story 1 completion
- **Polish (Phase 7)**: Depends on all user stories complete

### User Story Dependencies

```
Phase 1 (Setup) ──────┬──────> Phase 2 (Tests) ──────> Phase 3 (US1) ──┬──> Phase 5 (US3)
                      │                                                 │
                      │                                                 └──> Phase 6 (US4)
                      │
                      └──────────────────────────────────────────────────> Phase 4 (US2)
                                                                              │
                                                                              v
                                                                        Phase 7 (Polish)
```

- **User Story 1 (P1)**: Core change - must complete first
- **User Story 2 (P2)**: Can start after Phase 1, parallel with US1 (different files)
- **User Story 3 (P3)**: Depends on US1 (uses same init flow)
- **User Story 4 (P4)**: Depends on US1 (uses same init flow)

### Parallel Opportunities

Within Phase 1 (different functions/fields):
- T001, T002, T003, T004 can run in parallel (different struct modifications)
- T005, T006 depend on above

Within Phase 2:
- T008, T009, T010 can all run in parallel (independent test files)

Within User Story 1:
- T011, T012, T013 can run in parallel (different test cases)
- T014-T022 should be sequential (same file, interdependent)

Within User Story 2:
- T023, T024 can run in parallel (different test cases)
- T025-T031 should be sequential (building up the function)

---

## Parallel Example: User Story 2

```bash
# Launch tests for User Story 2 together:
Task: "Add test for setupOpenCodeAuth() function in internal/cli/start_test.go"
Task: "Add test for auth file creation error handling in internal/cli/start_test.go"

# Then implement sequentially:
Task: "Add setupOpenCodeAuth() function to internal/cli/start.go"
# ... remaining implementation tasks
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (schema changes)
2. Complete Phase 2: Foundational (test updates)
3. Complete Phase 3: User Story 1 (init simplification)
4. **STOP and VALIDATE**: Test `sandctl init` with 2 prompts
5. Can deploy MVP at this point - init works, sandbox auth is manual

### Incremental Delivery

1. Complete Setup + Foundational → Schema ready
2. Add User Story 1 → Test independently → MVP (init works!)
3. Add User Story 2 → Test independently → Sandbox auth automatic
4. Add User Story 3 → Test independently → CI/CD support
5. Add User Story 4 → Test independently → Migration complete
6. Polish → Production ready

### Single Developer Strategy

Recommended order:
1. Phase 1 + Phase 2 first (break the build, update tests)
2. Phase 3 (US1) - get init working again
3. Phase 4 (US2) - add sandbox auth
4. Phase 5 (US3) - add non-interactive
5. Phase 6 (US4) - add migration
6. Phase 7 - final validation

---

## Notes

- Go is statically typed - schema changes in Phase 1 will cause compilation errors until init.go is updated
- Existing test patterns use `t.TempDir()` for isolation - follow same pattern
- Config writer already handles 0600 permissions - no changes needed there
- `sprites.ExecCommand()` already exists for sandbox command execution
- Session `Agent` field removal may require updates to list/display commands
