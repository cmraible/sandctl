# Tasks: Code Quality Hooks

**Input**: Design documents from `/specs/005-code-quality-hooks/`
**Prerequisites**: plan.md, spec.md, research.md

**Tests**: Not explicitly requested - manual verification per acceptance scenarios

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

This project uses:
- Repository root for scripts and hooks
- `.githooks/` for git hook scripts
- `scripts/` for developer tooling
- `.github/workflows/` for CI configuration

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create directory structure for new files

- [x] T001 Create `.githooks/` directory at repository root
- [x] T002 [P] Create `scripts/` directory at repository root

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: No foundational work needed - all components are independent shell scripts and YAML configuration

**⚠️ Note**: This feature has no blocking prerequisites. Each user story creates standalone files.

**Checkpoint**: Setup ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Developer Catches Issues Before Commit (Priority: P1) 🎯 MVP

**Goal**: Pre-commit hook that blocks commits with formatting, linting, or compilation issues

**Independent Test**: Stage a Go file with a formatting issue (extra whitespace), attempt to commit, verify it's blocked with a message identifying the file

### Implementation for User Story 1

- [x] T003 [US1] Create pre-commit hook script at `.githooks/pre-commit` with:
  - Shebang and bash strict mode
  - Check for Go binary availability with helpful error if missing
  - Get list of staged Go files using `git diff --cached --name-only --diff-filter=ACM | grep '\.go$'`
  - Exit 0 early if no Go files staged

- [x] T004 [US1] Add gofmt check to `.githooks/pre-commit`:
  - Run `gofmt -l` on staged files
  - If any files returned, print error listing unformatted files
  - Exit 1 to block commit

- [x] T005 [US1] Add go vet check to `.githooks/pre-commit`:
  - Run `go vet` on packages containing staged files
  - If vet fails, print error with details
  - Exit 1 to block commit

- [x] T006 [US1] Add golangci-lint check to `.githooks/pre-commit`:
  - Check for golangci-lint availability with installation instructions if missing
  - Run `golangci-lint run` on staged files
  - If lint fails, print error with details
  - Exit 1 to block commit

- [x] T007 [US1] Add success message and make hook executable:
  - Print success message if all checks pass
  - Exit 0 to allow commit
  - Run `chmod +x .githooks/pre-commit`

**Checkpoint**: Pre-commit hook is functional. Can manually test by:
1. Running `git config core.hooksPath .githooks`
2. Staging a file with formatting issues
3. Attempting commit - should be blocked

---

## Phase 4: User Story 2 - CI Validates Pull Requests (Priority: P2)

**Goal**: CI pipeline enforces same quality checks on all PRs regardless of local hook status

**Independent Test**: Create a PR with a linting issue (e.g., unused variable), verify CI fails with clear error message

### Implementation for User Story 2

- [x] T008 [US2] Add lint job to `.github/workflows/ci.yml`:
  - New job `lint` running on `ubuntu-latest`
  - Timeout of 10 minutes
  - Checkout code step
  - Setup Go step using `go-version-file: 'go.mod'`

- [x] T009 [US2] Add golangci-lint action to lint job in `.github/workflows/ci.yml`:
  - Use `golangci/golangci-lint-action@v4`
  - Configure to use existing `.golangci.yml`
  - Enable PR annotations for inline error display

- [x] T010 [US2] Add formatting check step to lint job in `.github/workflows/ci.yml`:
  - Run `gofmt -d .` to show formatting diff
  - Fail if any output (indicates unformatted files)
  - Use shell script to check exit properly

**Checkpoint**: CI lint job is complete. Can test by pushing a branch and opening a PR.

---

## Phase 5: User Story 3 - Easy Hook Installation (Priority: P3)

**Goal**: Single-command hook installation for new contributors

**Independent Test**: Clone repo fresh, run installation command, verify hooks are active by attempting commit

### Implementation for User Story 3

- [x] T011 [US3] Create installation script at `scripts/install-hooks.sh`:
  - Shebang and bash strict mode
  - Verify running from repository root (check for `.git` directory)
  - Run `git config core.hooksPath .githooks`
  - Print success message with usage instructions
  - Make script executable

- [x] T012 [US3] Add `install-hooks` target to `Makefile`:
  - Target runs `./scripts/install-hooks.sh`
  - Add to `.PHONY` declaration
  - Add help text comment

- [x] T013 [US3] Add `check-fmt` target to `Makefile`:
  - Run `gofmt -d .` and fail if output
  - Add to `.PHONY` declaration
  - Add help text comment (for CI use)

**Checkpoint**: Installation is complete. New developers can run `make install-hooks` after cloning.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and documentation

- [x] T014 Verify all existing code passes quality checks:
  - Run `make lint` and fix any issues
  - Run `make fmt` if needed
  - Ensure clean baseline before merging

- [ ] T015 [P] Test full workflow end-to-end:
  - Install hooks via `make install-hooks`
  - Stage a file with intentional formatting issue
  - Verify commit blocked with clear message
  - Fix issue and verify commit succeeds

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - creates directories
- **Foundational (Phase 2)**: N/A - no blocking prerequisites for this feature
- **User Stories (Phase 3-5)**: Can proceed in parallel or sequentially
  - US1 (pre-commit hook) is the MVP
  - US2 (CI) is independent - different file
  - US3 (installation) depends on US1 hook existing but can be developed in parallel
- **Polish (Phase 6)**: After all user stories complete

### User Story Dependencies

- **User Story 1 (P1)**: No dependencies - creates `.githooks/pre-commit`
- **User Story 2 (P2)**: No dependencies - modifies `.github/workflows/ci.yml`
- **User Story 3 (P3)**: Soft dependency on US1 (hook must exist to install) but script can be written in parallel

### Within Each User Story

- T003 → T004 → T005 → T006 → T007 (sequential additions to same file)
- T008 → T009 → T010 (sequential additions to same file)
- T011 → T012 → T013 (T011 first, then T012/T013 parallel)

### Parallel Opportunities

- T001 and T002 can run in parallel (different directories)
- User Stories 1, 2, and 3 modify different files and can be developed in parallel
- T012 and T013 can run in parallel (different Makefile targets)
- T014 and T015 can run in parallel

---

## Parallel Example: All User Stories

```bash
# After Phase 1 (Setup), all user stories can start in parallel:

# Developer A works on User Story 1:
Task: "Create pre-commit hook script at .githooks/pre-commit"
# ... continues with T004-T007

# Developer B works on User Story 2:
Task: "Add lint job to .github/workflows/ci.yml"
# ... continues with T009-T010

# Developer C works on User Story 3:
Task: "Create installation script at scripts/install-hooks.sh"
# ... continues with T012-T013
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (create directories)
2. Complete Phase 3: User Story 1 (pre-commit hook)
3. **STOP and VALIDATE**: Manually test hook
   - `git config core.hooksPath .githooks`
   - Stage bad code, verify blocked
   - Stage good code, verify passes
4. Merge as MVP if needed

### Incremental Delivery

1. Setup → Create directories
2. User Story 1 → Pre-commit hook works locally → Validate
3. User Story 2 → CI enforces on PRs → Validate
4. User Story 3 → Easy installation → Validate
5. Polish → Clean baseline, documentation

### Single Developer Strategy

Execute in priority order:
1. T001-T002 (setup)
2. T003-T007 (US1 - pre-commit hook)
3. T008-T010 (US2 - CI job)
4. T011-T013 (US3 - installation)
5. T014-T015 (polish)

---

## Notes

- No automated tests requested - use manual verification per acceptance scenarios
- All user stories modify different files, enabling parallel development
- The pre-commit hook (US1) is the core MVP - CI and installation enhance it
- Existing `.golangci.yml` is already comprehensive - no changes needed
- Commit after each task or logical group
